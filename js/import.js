/**
 * import.js - Excel 导入与解析
 * 负责 SheetJS 解析 Excel、字段映射、校验、去重、合并到 LocalStorage
 */

const Import = {
    /** 字段映射（中文 → 内部字段） */
    COLUMN_MAP: {
        '\u680f\u76ee': 'category',
        '\u680f\u76ee\uff08\u677f\u5757\uff09': 'category',
        'category': 'category',
        '\u6807\u9898': 'title',
        'title': 'title',
        '\u94fe\u63a5': 'url',
        'link': 'url',
        'url': 'url',
        '\u516c\u53f8': 'company',
        'company': 'company',
        '\u4e3b\u9898': 'tags',
        'tags': 'tags',
        'tag': 'tags',
        '发布': 'publish',
        'publish': 'publish',
        '日期': 'publish',
        '区域': 'region',
        'region': 'region'
    },

    /** 必填字段 */
    REQUIRED_FIELDS: ['category', 'title', 'url'],

    /**
     * 处理导入文件
     * @param {File} file - Excel 文件
     * @returns {Promise<{success: boolean, data?: Object, message: string, errors: string[]}>}
     */
    process: async function (file) {
        const errors = [];

        // 1. 读取文件
        let workbook;
        try {
            const buffer = await file.arrayBuffer();
            workbook = XLSX.read(buffer, { type: 'array' });
        } catch (e) {
            return { success: false, message: '\u65e0\u6cd5\u8bfb\u53d6 Excel \u6587\u4ef6\uff1a' + e.message, errors: [e.message] };
        }

        // 2. 获取第一个工作表
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return { success: false, message: 'Excel \u6587\u4ef6\u4e2d\u6ca1\u6709\u5de5\u4f5c\u8868', errors: ['\u6ca1\u6709\u5de5\u4f5c\u8868'] };
        }

        const sheet = workbook.Sheets[sheetName];

        // 3. 转为 JSON（表头作为 key）
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rawRows.length === 0) {
            return { success: false, message: 'Excel \u6587\u4ef6\u4e3a\u7a7a\uff0c\u65e0\u6570\u636e\u53ef\u5bfc\u5165', errors: ['\u6570\u636e\u4e3a\u7a7a'] };
        }

        // 3.5. 提取 "链接" 列的 Excel 超链接（Hyperlink）
        //      当单元格显示文本不是 URL，但底层绑定了链接时，需要从 cell.l.Target 提取
        this._injectHyperlinks(sheet, rawRows);

        // 4. 字段映射：将中文表头映射为内部字段
        const mappedRows = this._mapColumns(rawRows);

        // 5. 数据校验
        const validation = this.validate(mappedRows);
        if (!validation.valid) {
            return { success: false, message: '\u6570\u636e\u6821\u9a8c\u672a\u901a\u8fc7\uff0c\u8bf7\u68c0\u67e5\u540e\u91cd\u8bd5', errors: validation.errors };
        }

        // 6. 解析字段（主题、发布）
        const parsed = this._parseRows(mappedRows);

        // 7. 去重合并
        const existingData = DataStore.allData || { issues: [] };
        const merged = this.merge(existingData, parsed);

        // 8. 保存到 LocalStorage 并更新内存
        DataStore.allData = merged;
        DataStore.saveToLocal(merged, 'import');

        // 构建成功消息
        let msg = '\u6210\u529f\u5bfc\u5165 ' + parsed.length + ' \u6761\u65b0\u95fb';
        if (parsed.duplicatedCount > 0) {
            msg += '\uff0c\u53bb\u91cd ' + parsed.duplicatedCount + ' \u6761';
        }
        msg += '\uff0c\u5f53\u524d\u5171 ' + DataStore.getTotalCount(merged) + ' \u6761\u65b0\u95fb';

        return {
            success: true,
            data: merged,
            message: msg,
            errors: []
        };
    },

    /**
     * 将中文表头映射为内部字段名
     * @param {Array} rows - sheet_to_json 输出的行
     * @returns {Array}
     */
    _mapColumns: function (rows) {
        // 获取所有原始 key
        const rawKeys = Object.keys(rows[0]);

        // 构建映射：原始key → 内部字段
        const keyMap = {};
        rawKeys.forEach(key => {
            const trimmed = key.trim();
            keyMap[key] = this.COLUMN_MAP[trimmed] || trimmed;
        });

        // 重新映射
        return rows.map(row => {
            const mapped = {};
            Object.keys(row).forEach(key => {
                const newKey = keyMap[key];
                if (newKey) {
                    // 如果是已有字段，合并（处理同一字段多列的情况）
                    if (mapped[newKey] && typeof mapped[newKey] === 'string') {
                        mapped[newKey] = mapped[newKey] + ' ' + String(row[key]).trim();
                    } else {
                        mapped[newKey] = String(row[key]).trim();
                    }
                }
            });
            return mapped;
        });
    },

    /**
     * 从 SheetJS 原始单元格中提取超链接（Hyperlink）URL
     * 当 Excel 单元格是带超链接的文本时，sheet_to_json 只读取显示文本
     * 但原始 Cell 对象有 l.Target 属性存放真正的链接 URL
     * 找到后追加到单元格值末尾，供 _extractUrl 提取
     * @param {Object} sheet - SheetJS 工作表对象
     * @param {Array} rawRows - sheet_to_json 输出的行数组（会被原地修改）
     */
    _injectHyperlinks: function (sheet, rawRows) {
        if (!sheet || !rawRows || rawRows.length === 0) return;
        if (!sheet['!ref']) return;

        // 获取表头行数组，确定 "链接" 列在 Excel 中的列索引
        let headerArray;
        try {
            headerArray = XLSX.utils.sheet_to_json(sheet, { header: 1 })?.[0];
        } catch (e) {
            return; // 无法解析表头，跳过
        }
        if (!headerArray) return;

        // 找到映射为 'url' 的列索引
        const urlColIdx = headerArray.findIndex(h => {
            if (h == null) return false;
            const t = String(h).trim();
            return this.COLUMN_MAP[t] === 'url';
        });
        if (urlColIdx < 0) return;

        // 获取工作表中数据实际起始行号
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const dataStartRow = range.s.r + 1; // 表头之后的第一行

        // 遍历每一行，检查 "链接" 列是否有超链接
        rawRows.forEach((row, idx) => {
            const sheetRow = dataStartRow + idx;
            const cellAddr = XLSX.utils.encode_cell({ c: urlColIdx, r: sheetRow });
            const cell = sheet[cellAddr];

            // SheetJS 中普通单元格格式：{ v: 显示值, t: 类型 }
            // 超链接单元格格式：{ v: 显示值, l: { Target: 'https://...' } }
            if (cell && cell.l && cell.l.Target) {
                const hyperlinkUrl = String(cell.l.Target).trim();
                if (hyperlinkUrl) {
                    // 获取该行 "链接" 列的原始 header 名称（如 "链接"）
                    const headerName = headerArray[urlColIdx];
                    if (headerName != null && row[headerName] !== undefined) {
                        const cellValue = String(row[headerName]);
                        // 仅在显示文本中不含 http:// 时才追加超链接 URL
                        if (!/https?:\/\//i.test(cellValue)) {
                            row[headerName] = cellValue + '\n' + hyperlinkUrl;
                        }
                    }
                }
            }
        });
    },

    /**
     * 从文本中提取第一个 URL
     * 支持 "描述文字 https://url" 或纯 URL 两种格式
     * @param {string} text
     * @returns {string} 提取到的 URL，或原始文本（如果没找到 URL）
     */
    _extractUrl: function (text) {
        if (!text) return '';
        const trimmed = text.trim();
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (!match) return trimmed;
        // 去除 URL 末尾的常见标点符号
        return match[0].replace(/[\uff0c\u3001\u3002\uff1b\uff1a,.;:！!？?）\)\s]+$/, '');
    },

    /**
     * 校验数据
     * @param {Array} rows - 映射后的行数据
     * @returns {{ valid: boolean, errors: Array }}
     */
    validate: function (rows) {
        const errors = [];

        rows.forEach((row, index) => {
            const lineNum = index + 2; // +2 for header row + 1-based

            // 检查必填字段
            this.REQUIRED_FIELDS.forEach(field => {
                if (!row[field] || row[field].trim() === '') {
                    errors.push('第 ' + lineNum + ' 行：[' + field + '] 为必填字段');
                }
            });

            // 检查 URL 格式（支持混合文本，从中搜索 URL 模式）
            if (row.url && row.url.trim()) {
                const url = row.url.trim();
                const hasUrl = /https?:\/\/[^\s]+/.test(url);
                if (!hasUrl) {
                    errors.push('第 ' + lineNum + ' 行：链接字段中必须包含 http:// 或 https:// 开头的 URL');
                }
            }
        });

        return { valid: errors.length === 0, errors: errors };
    },

    /**
     * 解析行数据（主题字符串→数组、发布字段→日期+期数）
     * @param {Array} rows - 映射后的行
     * @returns {Array} 解析后的新闻对象数组
     */
    _parseRows: function (rows) {
        return rows.map(row => {
            // 解析主题（逗号/空格/分号分隔）
            let tags = [];
            if (row.tags && row.tags.trim()) {
                tags = row.tags.split(/[,;\uff0c\u3001\s]+/).map(t => t.trim()).filter(t => t);
            }

            // 解析发布字段
            const parsed = this._parsePublishField(row.publish || '');

            // 从链接字段中提取纯 URL（支持 "描述文字 + URL" 混合格式）
            const cleanUrl = this._extractUrl(row.url || '');

            return {
                category: (row.category || '').trim(),
                title: (row.title || '').trim(),
                url: cleanUrl,
                company: (row.company || '').trim(),
                tags: tags,
                region: (row.region || '').trim(),
                _issueNumber: parsed.issueNumber,
                _publishDate: parsed.publishDate
            };
        });
    },

    /**
     * 提取 URL 后面的描述文本（用作标题的备选）
     * @param {string} text - 链接字段的原始文本
     * @returns {string} URL 之前的描述文字
     */
    _extractDescription: function (text) {
        if (!text) return '';
        const trimmed = text.trim();
        const match = trimmed.match(/^(.*?)\s*https?:\/\/[^\s]+/);
        if (match && match[1].trim()) {
            return match[1].trim();
        }
        return '';
    },

    /**
     * 解析发布字段
     * "2025/5/8\n\u7b2c1\u671f" \u2192 { publishDate: "2025-05-08", issueNumber: 1 }
     * @param {string} publishStr
     * @returns {{ publishDate: string, issueNumber: number }}
     */
    _parsePublishField: function (publishStr) {
        let publishDate = '';
        let issueNumber = null;

        if (!publishStr) {
            return { publishDate: '', issueNumber: null };
        }

        // \u62c6\u5206\u591a\u884c\u5185\u5bb9
        const parts = publishStr.split(/[\n\r]+/).map(p => p.trim()).filter(p => p);

        parts.forEach(part => {
            // \u5c1d\u8bd5\u63d0\u53d6\u671f\u6570\uff1a\u7b2cX\u671f \u6216 Issue X
            const issueMatch = part.match(/\u7b2c\s*(\d+)\s*\u671f|issue\s*#?(\d+)/i);
            if (issueMatch) {
                issueNumber = parseInt(issueMatch[1] || issueMatch[2], 10);
                return;
            }

            // \u5c1d\u8bd5\u89e3\u6790\u65e5\u671f
            const date = this._parseDate(part);
            if (date) {
                publishDate = date;
            }
        });

        return { publishDate: publishDate, issueNumber: issueNumber };
    },

    /**
     * \u89e3\u6790\u591a\u79cd\u65e5\u671f\u683c\u5f0f\u4e3a YYYY-MM-DD
     * @param {string} str
     * @returns {string|null}
     */
    _parseDate: function (str) {
        if (!str) return null;

        // \u652f\u6301\u7684\u683c\u5f0f\uff1a
        // 2025/5/8, 2025-05-08, 2025\u5e7405\u670808\u65e5, 5/8/2025
        let match;

        // YYYY/MM/DD \u6216 YYYY-MM-DD
        match = str.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
        if (match) {
            return this._padDate(match[1], match[2], match[3]);
        }

        // M/D/YYYY \u6216 M/D/YY
        match = str.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
        if (match) {
            const year = match[3].length === 2 ? '20' + match[3] : match[3];
            return this._padDate(year, match[1], match[2]);
        }

        // \u4e2d\u6587\u65e5\u671f\uff1a2025\u5e7405\u670808\u65e5
        match = str.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
        if (match) {
            return this._padDate(match[1], match[2], match[3]);
        }

        // Excel \u65e5\u671f\u5e8f\u5217\u53f7\uff08\u6570\u5b57\uff09
        const num = parseInt(str, 10);
        if (!isNaN(num) && num > 40000 && num < 60000) {
            // Excel \u5e8f\u5217\u53f7\u8f6c\u65e5\u671f
            const d = new Date((num - 25569) * 86400 * 1000);
            return this._padDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
        }

        return null;
    },

    /**
     * \u683c\u5f0f\u5316\u65e5\u671f\u4e3a YYYY-MM-DD
     */
    _padDate: function (year, month, day) {
        const y = String(year);
        const m = String(month).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return y + '-' + m + '-' + d;
    },

    /**
     * \u5408\u5e76\u5bfc\u5165\u6570\u636e\u5230\u73b0\u6709\u6570\u636e
     * \u652f\u6301\u65b0\u65b0\u95fb\u52a0\u5165\u73b0\u6709\u671f\u6570\uff0c\u6216\u521b\u5efa\u65b0\u671f\u6570
     * @param {Object} existingData - \u73b0\u6709\u6570\u636e { issues: [...] }
     * @param {Array} importedItems - \u5bfc\u5165\u7684\u65b0\u95fb\u5bf9\u8c61\u6570\u7ec4\uff08\u5e26 _issueNumber, _publishDate\uff09
     * @returns {Object} \u5408\u5e76\u540e\u7684\u6570\u636e
     */
    merge: function (existingData, importedItems) {
        // \u6df1\u62f7\u8d1d\u73b0\u6709\u6570\u636e
        const merged = JSON.parse(JSON.stringify(existingData));
        if (!merged.issues) merged.issues = [];

        // \u7d2f\u8ba1\u53bb\u91cd\u6570
        let dedupCount = 0;

        // \u6309 _issueNumber \u5206\u7ec4\u5bfc\u5165\u7684\u65b0\u95fb
        const grouped = {};
        importedItems.forEach(item => {
            const issueNum = item._issueNumber || null;
            if (!grouped[issueNum]) grouped[issueNum] = [];
            grouped[issueNum].push(item);
        });

        Object.keys(grouped).forEach(key => {
            const items = grouped[key];
            const issueNum = key === 'null' ? null : parseInt(key, 10);

            // \u83b7\u53d6\u65e5\u671f\uff08\u4ece\u7b2c\u4e00\u6761\u8bb0\u5f55\u4e2d\u63d0\u53d6\uff09
            const publishDate = items[0]._publishDate || '';

            // \u67e5\u627e\u662f\u5426\u5df2\u6709\u8be5\u671f\u6570
            let targetIssue = merged.issues.find(i => i.issueNumber === issueNum);

            if (targetIssue) {
                // \u5df2\u6709\u671f\u6570\uff1a\u53bb\u91cd\u540e\u8ffd\u52a0
                const existingUrls = new Set(
                    (targetIssue.news || []).map(n => n.url)
                );

                items.forEach(item => {
                    if (!existingUrls.has(item.url)) {
                        targetIssue.news.push(this._toNewsItem(item));
                    } else {
                        dedupCount++;
                    }
                });
            } else {
                // \u65b0\u671f\u6570\uff1a\u521b\u5efa\u65b0 issue
                const actualIssueNum = issueNum !== null
                    ? issueNum
                    : (merged.issues.length > 0
                        ? Math.max(...merged.issues.map(i => i.issueNumber)) + 1
                        : 1);

                merged.issues.push({
                    issueNumber: actualIssueNum,
                    publishDate: publishDate,
                    news: items.map(item => this._toNewsItem(item))
                });
            }
        });

        // \u6309\u671f\u53f7\u5347\u5e8f\u6392\u5217
        merged.issues.sort((a, b) => a.issueNumber - b.issueNumber);

        // \u5728\u8fd4\u56de\u7ed3\u679c\u4e2d\u9644\u5e26\u53bb\u91cd\u4fe1\u606f
        importedItems.duplicatedCount = dedupCount;

        return merged;
    },

    /**
     * \u5c06\u5bfc\u5165\u7684\u884c\u5bf9\u8c61\u8f6c\u6362\u4e3a news.json \u683c\u5f0f\uff08\u53bb\u9664 _ \u524d\u7f00\u5b57\u6bb5\uff09
     */
    _toNewsItem: function (item) {
        return {
            category: item.category,
            title: item.title,
            url: item.url,
            company: item.company,
            tags: item.tags,
            region: item.region
        };
    }
};
