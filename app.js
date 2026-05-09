/**
 * app.js - 主入口
 * 负责应用初始化、视图管理（主页/详情）、筛选、事件绑定
 */

const App = {
    /** 应用是否已初始化 */
    initialized: false,

    /** 原始数据引用 */
    _rawData: null,

    /** 当前视图 */
    _currentView: 'home', // 'home' | 'detail'

    /** 当前详情分类 */
    _currentCategory: null,

    /** 当前详情页码 */
    _currentPage: 1,

    /**
     * 初始化应用
     */
    init: function () {
        if (this.initialized) return;
        this.initialized = true;
        this.bindEvents();
        this.checkAuth();
    },

    /**
     * 绑定全局事件
     */
    bindEvents: function () {
        // ---- 密码验证 ----
        const authBtn = document.getElementById('auth-btn');
        const passwordInput = document.getElementById('password-input');
        if (authBtn) {
            authBtn.addEventListener('click', () => this.handleAuth());
        }
        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleAuth();
            });
        }

        // ---- 调试：清除锁定 ----
        const debugReset = document.getElementById('debug-reset');
        if (debugReset) {
            debugReset.addEventListener('click', () => {
                Auth.clearLockout();
                const input = document.getElementById('password-input');
                if (input) {
                    input.disabled = false;
                    input.focus();
                }
                document.getElementById('auth-btn').disabled = false;
                document.getElementById('auth-error').textContent = '✅ 锁定已清除，默认密码: admin';
            });
        }

        // ---- 管理员面板折叠 ----
        const adminToggle = document.getElementById('admin-toggle');
        if (adminToggle) {
            adminToggle.addEventListener('click', () => {
                const actions = document.getElementById('admin-actions');
                if (actions) {
                    actions.classList.toggle('collapsed');
                }
            });
        }

        // ---- 导入按钮 + 文件选择 ----
        const importBtn = document.getElementById('import-btn');
        const fileInput = document.getElementById('file-input');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this._handleImport(file);
                }
                fileInput.value = '';
            });
        }

        // ---- 清除数据按钮 ----
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('确定要清空所有导入的数据吗？此操作不可恢复。')) {
                    DataStore.clearCache();
                    alert('数据已清空，页面将刷新。');
                    location.reload();
                }
            });
        }

        // ---- 诊断按钮 ----
        const debugBtn = document.getElementById('debug-btn');
        if (debugBtn) {
            debugBtn.addEventListener('click', () => this._showDebugPanel());
        }

        // ---- 诊断面板关闭 ----
        const debugClose = document.getElementById('debug-close');
        if (debugClose) {
            debugClose.addEventListener('click', () => {
                document.getElementById('debug-overlay').style.display = 'none';
            });
        }

        // ===== 筛选事件 =====

        // 公司下拉筛选
        const companySelect = document.getElementById('filter-company');
        if (companySelect) {
            companySelect.addEventListener('change', (e) => {
                Filter.state.company = e.target.value;
                this._onFilterChange();
            });
        }

        // 主题下拉筛选
        const topicSelect = document.getElementById('filter-topic');
        if (topicSelect) {
            topicSelect.addEventListener('change', (e) => {
                Filter.state.topic = e.target.value;
                this._onFilterChange();
            });
        }

        // 年份下拉筛选
        const yearSelect = document.getElementById('filter-year');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                Filter.state.year = e.target.value;
                this._onFilterChange();
            });
        }

        // 月份下拉筛选
        const monthSelect = document.getElementById('filter-month');
        if (monthSelect) {
            monthSelect.addEventListener('change', (e) => {
                Filter.state.month = e.target.value;
                this._onFilterChange();
            });
        }

        // 区域下拉筛选
        const regionSelect = document.getElementById('filter-region');
        if (regionSelect) {
            regionSelect.addEventListener('change', (e) => {
                Filter.state.region = e.target.value;
                this._onFilterChange();
            });
        }

        // ===== 内容区事件委托（more / 返回 / 翻页） =====
        const contentEl = document.getElementById('news-content');
        if (contentEl) {
            contentEl.addEventListener('click', (e) => {
                // 点击 "more" 跳转到栏目详情
                const moreLink = e.target.closest('.cat-more');
                if (moreLink) {
                    const category = moreLink.dataset.category;
                    if (category) {
                        this._showCategoryDetail(category);
                    }
                    return;
                }

                // 点击 "返回首页"
                const backBtn = e.target.closest('#back-to-home');
                if (backBtn) {
                    this._showHome();
                    return;
                }

                // 点击翻页按钮
                const pageBtn = e.target.closest('.page-btn');
                if (pageBtn) {
                    const page = parseInt(pageBtn.dataset.page, 10);
                    if (page > 0 && this._currentCategory) {
                        this._currentPage = page;
                        this._showCategoryDetail(this._currentCategory, page);
                    }
                    return;
                }
            });
        }
    },

    /**
     * 筛选条件变化时统一处理
     */
    _onFilterChange: function () {
        if (this._currentView === 'home') {
            this._renderHomeView();
        } else if (this._currentView === 'detail' && this._currentCategory) {
            this._renderDetailView(this._currentCategory, this._currentPage);
        }
    },

    /**
     * 显示首页
     */
    _showHome: function () {
        this._currentView = 'home';
        this._currentCategory = null;
        this._currentPage = 1;
        this._renderHomeView();
    },

    /**
     * 显示栏目详情
     */
    _showCategoryDetail: function (category, page) {
        this._currentView = 'detail';
        this._currentCategory = category;
        this._currentPage = page || 1;
        this._renderDetailView(category, this._currentPage);
    },

    /**
     * 渲染首页
     */
    _renderHomeView: function () {
        const emptyEl = document.getElementById('empty-state');
        const filterBar = document.getElementById('filter-bar');

        // 始终显示筛选栏
        if (filterBar) filterBar.style.display = 'flex';

        // 隐藏全屏空状态（用卡片内的"暂无相关新闻"替代）
        if (emptyEl) emptyEl.style.display = 'none';

        try {
            const data = this._rawData || { issues: [] };
            const filtered = Filter.apply(data.issues, Filter.state);
            Render.renderHome(filtered);
        } catch (e) {
            console.error('[App] 渲染首页失败:', e);
        }

        // 更新底部信息
        if (this._rawData && this._rawData.issues && this._rawData.issues.length > 0) {
            this._updateFooterInfo();
        } else {
            const infoEl = document.getElementById('issue-info');
            if (infoEl) infoEl.textContent = '暂无数据，请导入 Excel 文件';
        }
    },

    /**
     * 渲染栏目详情
     */
    _renderDetailView: function (category, page) {
        const emptyEl = document.getElementById('empty-state');
        if (!this._rawData || !this._rawData.issues || this._rawData.issues.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        try {
            const filtered = Filter.apply(this._rawData.issues, Filter.state);
            Render.renderCategoryDetail(category, filtered, page);
            emptyEl.style.display = 'none';
        } catch (e) {
            console.error('[App] 渲染详情页失败:', e);
        }
    },

    /**
     * 更新底部信息
     */
    _updateFooterInfo: function () {
        const infoEl = document.getElementById('issue-info');
        if (!infoEl) return;

        if (!this._rawData) { infoEl.textContent = '暂无数据'; return; }

        const totalOriginal = DataStore.getTotalCount(this._rawData);
        const allIssues = DataStore.getAllIssues(this._rawData);
        const latest = allIssues[0];

        if (this._currentView === 'home') {
            infoEl.textContent = '共 ' + allIssues.length + ' 期 · ' + totalOriginal + ' 条新闻 · 最新：第 ' + latest.issueNumber + ' 期（' + latest.publishDate.replace(/-/g, '/') + '）';
        } else if (this._currentView === 'detail' && this._currentCategory) {
            const filtered = Filter.apply(this._rawData.issues, Filter.state);
            let count = 0;
            filtered.forEach(issue => {
                (issue.news || []).forEach(item => {
                    if (item.category === this._currentCategory) count++;
                });
            });
            infoEl.textContent = this._currentCategory + ' · ' + count + ' 条新闻（共 ' + totalOriginal + ' 条）';
        }
    },

    /**
     * HTML 转义（防止 XSS）
     */
    _escapeHtml: function (str) {
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    /* =========================================================
     *  密码验证 & 登录控制
     * ========================================================= */

    /**
     * 检查登录状态
     */
    checkAuth: function () {
        const lockStatus = Auth.isLocked();
        if (lockStatus.locked) {
            this.showLockMessage(lockStatus.remainingMinutes);
            return;
        }
        if (Auth.isLoggedIn()) {
            this.showApp();
        } else {
            this.showAuth();
        }
    },

    /**
     * 显示主界面
     */
    showApp: function () {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        this.loadAndDisplay();
    },

    /**
     * 显示密码验证页
     */
    showAuth: function () {
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        document.getElementById('password-input').value = '';
        document.getElementById('password-input').focus();
    },

    /**
     * 处理密码验证
     */
    handleAuth: async function () {
        const input = document.getElementById('password-input');
        const errorEl = document.getElementById('auth-error');
        const password = input.value.trim();

        if (!password) {
            errorEl.textContent = '请输入密码';
            return;
        }

        const lockStatus = Auth.isLocked();
        if (lockStatus.locked) {
            this.showLockMessage(lockStatus.remainingMinutes);
            return;
        }

        const valid = await Auth.verify(password);
        if (valid) {
            Auth.createSession();
            errorEl.textContent = '';
            this.showApp();
        } else {
            const result = Auth.recordFailedAttempt();
            if (result.locked) {
                this.showLockMessage(result.remainingMinutes);
            } else {
                errorEl.textContent = '密码错误，还剩 ' + result.attemptsLeft + ' 次机会';
                input.value = '';
                input.focus();
            }
        }
    },

    /**
     * 显示锁定提示
     */
    showLockMessage: function (minutes) {
        const overlay = document.getElementById('auth-overlay');
        overlay.style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        const errorEl = document.getElementById('auth-error');
        const input = document.getElementById('password-input');
        input.value = '';
        input.disabled = true;
        document.getElementById('auth-btn').disabled = true;
        errorEl.textContent = '密码错误次数过多，请 ' + minutes + ' 分钟后再试';

        setTimeout(() => {
            input.disabled = false;
            document.getElementById('auth-btn').disabled = false;
            errorEl.textContent = '';
            input.focus();
        }, minutes * 60 * 1000);
    },

    /* =========================================================
     *  数据加载 & 导入
     * ========================================================= */

    /**
     * 加载并展示数据
     */
    loadAndDisplay: async function () {
        const loadingEl = document.getElementById('loading-state');
        const contentEl = document.getElementById('news-content');
        const emptyEl = document.getElementById('empty-state');

        try {
            loadingEl.style.display = 'block';
            contentEl.innerHTML = '';
            emptyEl.style.display = 'none';

            const data = await DataStore.load();
            this._rawData = data;

            // 更新头部徽章
            const issues = DataStore.getAllIssues(data);
            const badgeEl = document.getElementById('issue-badge');
            if (issues.length > 0) {
                badgeEl.textContent = '第 ' + issues[0].issueNumber + ' 期';
            } else {
                badgeEl.textContent = '';
            }

            loadingEl.style.display = 'none';

            // 更新筛选下拉选项
            Render.updateFilterOptions(data);

            // 初始状态：主页
            Filter.reset();
            this._currentView = 'home';
            this._renderHomeView();

        } catch (err) {
            loadingEl.style.display = 'none';
            contentEl.innerHTML = '<p style="text-align:center;color:#e74c3c;padding:2rem;">❌ 数据加载失败：' + err.message + '</p>';
        }
    },

    /**
     * 处理 Excel 文件导入
     */
    _handleImport: async function (file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            this._showToast('请选择 .xlsx 或 .xls 格式的 Excel 文件', 'error');
            return;
        }

        const importBtn = document.getElementById('import-btn');
        importBtn.disabled = true;
        importBtn.textContent = '⏳ 导入中...';

        try {
            const result = await Import.process(file);

            if (result.success) {
                if (!result.data || !result.data.issues || !Array.isArray(result.data.issues) || result.data.issues.length === 0) {
                    console.error('[App] 导入数据格式异常:', result.data);
                    this._showToast('导入数据格式异常，请检查 Excel 文件', 'error');
                    return;
                }

                console.log('[App] 导入成功:', {
                    期数: result.data.issues.length,
                    总条数: result.data.issues.reduce((s, i) => s + (i.news || []).length, 0)
                });

                this._rawData = result.data;

                // 更新筛选下拉
                Render.updateFilterOptions(result.data);

                // 更新头部徽章
                const issues = DataStore.getAllIssues(result.data);
                const badgeEl = document.getElementById('issue-badge');
                if (issues.length > 0) {
                    badgeEl.textContent = '第 ' + issues[0].issueNumber + ' 期';
                }

                // 重置筛选条件，回到首页
                Filter.reset();
                this._resetFilterUI();
                this._currentView = 'home';
                this._renderHomeView();

                this._showToast(result.message, 'success');
            } else {
                let msg = result.message;
                if (result.errors && result.errors.length > 0) {
                    msg += '（' + result.errors.slice(0, 5).join('；') + '）';
                    if (result.errors.length > 5) {
                        msg += '...共 ' + result.errors.length + ' 个错误';
                    }
                }
                this._showToast(msg, 'error');
            }
        } catch (err) {
            this._showToast('导入失败：' + err.message, 'error');
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = '📥 导入';
        }
    },

    /**
     * 重置筛选 UI 到初始状态
     */
    _resetFilterUI: function () {
        const companySelect = document.getElementById('filter-company');
        if (companySelect) companySelect.value = 'all';

        const topicSelect = document.getElementById('filter-topic');
        if (topicSelect) topicSelect.value = 'all';

        const yearSelect = document.getElementById('filter-year');
        if (yearSelect) yearSelect.value = 'all';

        const monthSelect = document.getElementById('filter-month');
        if (monthSelect) monthSelect.value = 'all';

        const regionSelect = document.getElementById('filter-region');
        if (regionSelect) regionSelect.value = 'all';
    },

    /**
     * 显示诊断面板
     */
    _showDebugPanel: function () {
        const overlay = document.getElementById('debug-overlay');
        const body = document.getElementById('debug-body');
        if (!overlay || !body) return;

        const data = this._rawData;
        let html = '';

        // ---- localStorage 状态 ----
        html += '<h3>💾 缓存状态</h3>';
        html += '<div class="debug-section">';
        try {
            const raw = localStorage.getItem(DataStore.STORAGE_KEY);
            if (raw) {
                const cache = JSON.parse(raw);
                const totalItems = cache.data && cache.data.issues
                    ? cache.data.issues.reduce((s, i) => s + (i.news || []).length, 0) : 0;
                const totalIssues = cache.data && cache.data.issues ? cache.data.issues.length : 0;
                html += '<span class="label">LocalStorage：</span>✅ 有缓存 | ' + totalIssues + ' 期, ' + totalItems + ' 条<br>';
                html += '<span class="label">缓存时间：</span>' + new Date(cache.timestamp).toLocaleString() + '';
            } else {
                html += '<span class="label">LocalStorage：</span>❌ 无缓存数据';
            }
        } catch (e) {
            html += '<span class="label">LocalStorage：</span>⚠️ 读取失败: ' + this._escapeHtml(e.message);
        }
        html += '</div>';

        // ---- 内存数据 ----
        html += '<h3>📊 基本信息</h3>';
        html += '<div class="debug-section">';
        if (!data || !data.issues || data.issues.length === 0) {
            html += '<span class="label">内存数据：</span>❌ 当前页面没有数据</div>';
            body.innerHTML = html;
            overlay.style.display = 'flex';
            return;
        }
        const totalItems = data.issues.reduce((s, i) => s + (i.news || []).length, 0);
        html += '<span class="label">总期数：</span><span class="val">' + data.issues.length + '</span> &nbsp; ';
        html += '<span class="label">总新闻数：</span><span class="val">' + totalItems + '</span>';
        html += '</div>';

        // ---- 公司列表 ----
        const companies = new Set();
        data.issues.forEach(i => (i.news || []).forEach(n => { if (n.company) companies.add(n.company); }));
        html += '<h3>🏢 公司列表（下拉选项值）</h3>';
        html += '<div class="debug-section"><ul>';
        Array.from(companies).sort().forEach(c => {
            html += '<li>' + this._escapeHtml(c) + '</li>';
        });
        html += '</ul></div>';

        // ---- 当前筛选状态 ----
        html += '<h3>🔎 当前筛选条件</h3>';
        html += '<div class="debug-section"><span class="code">' + JSON.stringify(Filter.state, null, 2) + '</span></div>';

        // ---- 匹配测试 ----
        if (Filter.state.company !== 'all') {
            html += '<h3>🔬 公司匹配测试</h3>';
            html += '<div class="debug-section">';
            html += '<span class="label">选中值（下拉）：</span> <span class="code">' + this._escapeHtml(JSON.stringify(Filter.state.company)) + '</span><br>';
            html += '<span class="label">数据中的公司值对比：</span><ul>';
            Array.from(companies).sort().forEach(c => {
                const match = c.trim() === Filter.state.company.trim();
                html += '<li class="' + (match ? 'match' : 'mismatch') + '">'
                    + this._escapeHtml(JSON.stringify(c)) + (match ? ' ✅' : ' ❌') + '</li>';
            });
            html += '</ul></div>';
        }

        // ---- 原始数据预览 ----
        let sampleCount = 0;
        html += '<h3>📄 原始数据预览（前10条，公司字段）</h3>';
        html += '<div class="debug-section"><span class="code">';
        for (const issue of data.issues) {
            for (const item of (issue.news || [])) {
                if (sampleCount >= 10) break;
                html += '公司: ' + this._escapeHtml(JSON.stringify(item.company || '')) + ' / 类别: ' + this._escapeHtml(item.category || '') + '\n';
                sampleCount++;
            }
            if (sampleCount >= 10) break;
        }
        html += '</span></div>';

        // ---- 筛选结果预览 ----
        html += '<h3>🔍 筛选结果（按当前条件过滤后）</h3>';
        try {
            const filtered = Filter.apply(data.issues, Filter.state);
            const flat = Render._flattenNews(filtered);
            html += '<div class="debug-section">';
            html += '<span class="label">匹配条数：</span><span class="val">' + flat.length + '</span><br>';
            if (flat.length > 0) {
                html += '<span class="label">类别分布：</span>';
                const catCount = {};
                flat.forEach(item => {
                    const cat = item.category || '未分类';
                    catCount[cat] = (catCount[cat] || 0) + 1;
                });
                html += '<span class="code">' + JSON.stringify(catCount, null, 2) + '</span><br>';
                html += '<span class="label">前5条：</span><br><span class="code">';
                flat.slice(0, 5).forEach((item, i) => {
                    html += (i+1) + '. ' + this._escapeHtml(JSON.stringify({company: item.company, category: item.category, title: (item.title||'').substring(0,20)})) + '\n';
                });
                html += '</span>';
            } else {
                html += '<span style="color:red;">筛选后无数据！请检查下面是否存在类别与筛选不匹配的问题</span>';
            }
            html += '</div>';
        } catch (e) {
            html += '<div class="debug-section"><span style="color:red;">筛选执行出错: ' + this._escapeHtml(e.message) + '</span></div>';
        }

        body.innerHTML = html;
        overlay.style.display = 'flex';
    },

    /**
     * 显示 Toast 提示
     */
    _showToast: function (message, type) {
        const existing = document.getElementById('import-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'import-toast';
        toast.className = 'toast ' + (type === 'success' ? 'toast-success' : 'toast-error');

        const icon = type === 'success' ? '✅' : '❌';
        toast.innerHTML = '<span class="toast-icon">' + icon + '</span><span class="toast-text">' + message + '</span>';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fadeout');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    },

    /**
     * 手动刷新数据
     */
    refreshData: async function () {
        await this.loadAndDisplay();
    }
};

// DOM 加载完成后启动
document.addEventListener('DOMContentLoaded', () => App.init());
