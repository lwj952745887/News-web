/**
 * render.js - 页面渲染
 * 负责主页卡片网格、分类详情页（分页）、筛选下拉框更新
 */

const Render = {
    /** 栏目顺序（固定排列） */
    CATEGORY_ORDER: ['客户动向', '友商观察', '行业脉搏', '全球视野', '科技前沿'],

    /** 栏目图标映射 */
    CATEGORY_ICONS: {
        '客户动向': '\ud83d\udcca',
        '友商观察': '\ud83d\udc40',
        '行业脉搏': '\ud83d\udcc8',
        '全球视野': '\ud83c\udf0d',
        '科技前沿': '\ud83d\udd2c'
    },

    /** 每页显示条数 */
    ITEMS_PER_PAGE: 10,

    /** 每卡显示条数（主页） */
    ITEMS_PER_CARD: 3,

    /**
     * 渲染主页：5个栏目卡片网格
     * @param {Array} issues - 筛选后的 issues 数组
     */
    renderHome: function (issues) {
        const container = document.getElementById('news-content');
        if (!container) return;

        // 展开所有新闻为扁平数组
        const flatItems = this._flattenNews(issues);

        // 按栏目分组
        const groups = {};
        flatItems.forEach(item => {
            const cat = item.category || '\u672a\u5206\u7c7b';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });

        let html = '<div class="home-grid">';

        this.CATEGORY_ORDER.forEach(cat => {
            const items = groups[cat] || [];
            const displayItems = items.slice(0, this.ITEMS_PER_CARD);
            const moreCount = Math.max(0, items.length - this.ITEMS_PER_CARD);
            const icon = this.CATEGORY_ICONS[cat] || '\ud83d\udcf0';

            html += '<div class="cat-card" data-category="' + this._escapeHtml(cat) + '">';
            html += '  <div class="cat-card-header">';
            html += '    ' + icon + ' ' + this._escapeHtml(cat);
            html += '  </div>';
            html += '  <div class="cat-card-body">';

            if (displayItems.length === 0) {
                html += '    <div class="cat-card-empty">\u6682\u65e0\u76f8\u5173\u65b0\u95fb</div>';
            } else {
                displayItems.forEach(item => {
                    html += '    <div class="cat-card-item">';
                    html += '      <a href="' + this._escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">'
                        + this._escapeHtml(item.title) + '</a>';
                    html += '      <span class="cat-card-company">' + this._escapeHtml(item.company) + '</span>';
                    html += '    </div>';
                });
            }

            html += '  </div>';
            html += '  <div class="cat-card-footer">';
            if (items.length > 0) {
                html += '    <span class="cat-more" data-category="' + this._escapeHtml(cat) + '">查看更多 ›</span>';
            }
            html += '  </div>';
            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * 渲染栏目详情页（分页）
     * @param {string} category - 栏目名
     * @param {Array} issues - 筛选后的 issues 数组
     * @param {number} page - 当前页码（从1开始）
     */
    renderCategoryDetail: function (category, issues, page) {
        const container = document.getElementById('news-content');
        if (!container) return;

        // 展开并筛选指定栏目的新闻
        const flatItems = this._flattenNews(issues)
            .filter(item => item.category === category);

        const totalItems = flatItems.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / this.ITEMS_PER_PAGE));
        page = Math.max(1, Math.min(page, totalPages));

        const startIdx = (page - 1) * this.ITEMS_PER_PAGE;
        const pageItems = flatItems.slice(startIdx, startIdx + this.ITEMS_PER_PAGE);

        let html = '';
        html += '<div class="detail-view">';
        html += '  <div class="detail-header">';
        html += '    <button id="back-to-home" class="btn-back">\u2190 \u8fd4\u56de\u9996\u9875</button>';
        html += '    <h2>' + (this.CATEGORY_ICONS[category] || '\ud83d\udcf0') + ' ' + this._escapeHtml(category)
            + ' <span class="detail-count">\u5171 ' + totalItems + ' \u6761</span></h2>';
        html += '  </div>';

        // 新闻列表
        html += '  <div class="detail-list">';
        if (pageItems.length === 0) {
            html += '    <div class="detail-empty">\u6682\u65e0\u76f8\u5173\u65b0\u95fb</div>';
        } else {
            pageItems.forEach((item, idx) => {
                const num = startIdx + idx + 1;
                const dateStr = item._publishDate ? item._publishDate.replace(/-/g, '/') : '';
                const tagsHtml = (item.tags || [])
                    .map(t => '<span class="tag">' + this._escapeHtml(t) + '</span>')
                    .join('');
                html += '    <div class="detail-item">';
                html += '      <span class="detail-num">' + num + '.</span>';
                html += '      <a href="' + this._escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" class="detail-title">'
                    + this._escapeHtml(item.title) + '</a>';
                html += '      <span class="detail-meta">';
                html += '        <span class="company">' + this._escapeHtml(item.company) + '</span>';
                html += '        ' + tagsHtml;
                html += '        ' + (dateStr ? '<span>' + dateStr + '</span>' : '');
                html += '      </span>';
                html += '    </div>';
            });
        }
        html += '  </div>';

        // 分页
        if (totalPages > 1) {
            html += '  <div class="pagination">';
            if (page > 1) {
                html += '    <button class="page-btn page-prev" data-page="' + (page - 1) + '">\u2039 \u4e0a\u4e00\u9875</button>';
            }
            html += '    <span class="page-info">\u7b2c ' + page + ' / ' + totalPages + ' \u9875</span>';
            if (page < totalPages) {
                html += '    <button class="page-btn page-next" data-page="' + (page + 1) + '">\u4e0b\u4e00\u9875 \u203a</button>';
            }
            html += '  </div>';
        }

        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * 更新全部筛选下拉框
     * @param {Object} data - 原始数据 { issues: [...] }
     */
    updateFilterOptions: function (data) {
        // 更新公司下拉
        const companySelect = document.getElementById('filter-company');
        if (companySelect && data && data.issues) {
            const companies = new Set();
            data.issues.forEach(issue => {
                (issue.news || []).forEach(item => {
                    if (item.company) companies.add(item.company);
                });
            });
            let html = '<option value="all">\u5168\u90e8\u516c\u53f8</option>';
            Array.from(companies).sort().forEach(c => {
                html += '<option value="' + this._escapeHtml(c) + '">' + this._escapeHtml(c) + '</option>';
            });
            companySelect.innerHTML = html;
        }

        // 更新主题下拉（从所有 tags 中提取）
        const topicSelect = document.getElementById('filter-topic');
        if (topicSelect && data && data.issues) {
            const tags = new Set();
            data.issues.forEach(issue => {
                (issue.news || []).forEach(item => {
                    (item.tags || []).forEach(t => tags.add(t));
                });
            });
            let html = '<option value="all">\u5168\u90e8\u4e3b\u9898</option>';
            Array.from(tags).sort().forEach(t => {
                html += '<option value="' + this._escapeHtml(t) + '">' + this._escapeHtml(t) + '</option>';
            });
            topicSelect.innerHTML = html;
        }

        // 更新年份下拉（从所有 publishDate 中提取年份）
        const yearSelect = document.getElementById('filter-year');
        if (yearSelect && data && data.issues) {
            const years = new Set();
            data.issues.forEach(issue => {
                if (issue.publishDate && issue.publishDate.length >= 4) {
                    years.add(issue.publishDate.substring(0, 4));
                }
            });
            let html = '<option value="all">\u5168\u90e8\u5e74\u4efd</option>';
            Array.from(years).sort().reverse().forEach(y => {
                html += '<option value="' + y + '">' + y + ' \u5e74</option>';
            });
            yearSelect.innerHTML = html;
        }

        // 更新月份下拉（固定 1~12 月）
        const monthSelect = document.getElementById('filter-month');
        if (monthSelect) {
            const monthNames = ['1\u6708', '2\u6708', '3\u6708', '4\u6708', '5\u6708', '6\u6708',
                               '7\u6708', '8\u6708', '9\u6708', '10\u6708', '11\u6708', '12\u6708'];
            let html = '<option value="all">\u5168\u90e8\u6708\u4efd</option>';
            monthNames.forEach((name, idx) => {
                html += '<option value="' + (idx + 1) + '">' + name + '</option>';
            });
            monthSelect.innerHTML = html;
        }

        // 更新区域下拉（从所有新闻的 region 字段中提取）
        const regionSelect = document.getElementById('filter-region');
        if (regionSelect && data && data.issues) {
            const regions = new Set();
            data.issues.forEach(issue => {
                (issue.news || []).forEach(item => {
                    if (item.region && item.region.trim()) {
                        regions.add(item.region.trim());
                    }
                });
            });
            let html = '<option value="all">全部区域</option>';
            Array.from(regions).sort().forEach(r => {
                html += '<option value="' + this._escapeHtml(r) + '">' + this._escapeHtml(r) + '</option>';
            });
            regionSelect.innerHTML = html;
        }
    },

    /**
     * 展开所有期数的新闻为扁平数组，附带期数信息
     * @param {Array} issues
     * @returns {Array}
     */
    _flattenNews: function (issues) {
        const flatItems = [];
        (issues || []).forEach(issue => {
            const issueNum = issue.issueNumber;
            const pubDate = issue.publishDate;
            (issue.news || []).forEach(item => {
                flatItems.push({
                    ...item,
                    _issueNumber: issueNum,
                    _publishDate: pubDate
                });
            });
        });
        return flatItems;
    },

    /**
     * HTML 转义（防止 XSS）
     * @param {*} str
     * @returns {string}
     */
    _escapeHtml: function (str) {
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
};
