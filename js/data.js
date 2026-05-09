/**
 * data.js - 数据加载与缓存
 * 负责加载 news.json、LocalStorage 缓存管理、数据提取辅助方法
 */

const DataStore = {
    /** LocalStorage 键名 */
    STORAGE_KEY: 'news_app_data',

    /** 缓存过期时间（1小时） */
    CACHE_EXPIRY: 60 * 60 * 1000,

    /** 原始新闻数据 */
    allData: null,

    /** 当前筛选后的数据 */
    filteredData: null,

    /** 嵌入的默认数据（空数据，用户需导入 Excel） */
    DEFAULT_DATA: {
        "issues": []
    },

    /**
     * 判断是否通过 file:// 协议打开
     */
    _isFileProtocol: function () {
        return window.location && window.location.protocol === 'file:';
    },

    /**
     * 加载新闻数据
     * 优先从 LocalStorage 读取，无缓存则请求 news.json
     * file:// 协议下自动使用嵌入默认数据
     * @returns {Promise<Object>}
     */
    load: async function () {
        // 读取 LocalStorage 缓存
        const cache = this.loadFromLocal();

        // 情况1：有导入数据（Excel导入），优先级最高
        if (cache && cache.source === 'import') {
            this.allData = cache.data;
            console.log('[DataStore] 从 LocalStorage 加载导入数据');
            return cache.data;
        }

        // 情况2：file:// 协议下，有缓存用缓存，无缓存用默认空数据
        if (this._isFileProtocol()) {
            if (cache) {
                this.allData = cache.data;
                return this.allData;
            }
            console.log('[DataStore] file:// 协议，无缓存数据');
            this.allData = JSON.parse(JSON.stringify(this.DEFAULT_DATA));
            return this.allData;
        }

        // 情况3：正常部署环境，始终从服务器获取最新数据
        try {
            console.log('[DataStore] 从 news.json 加载最新数据');
            const response = await fetch('data/news.json');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            this.allData = data;
            this.saveToLocal(data, 'server');
            return data;
        } catch (err) {
            console.error('[DataStore] 加载失败:', err);
            // 兜底：有缓存则用缓存，无缓存返回空数据
            if (cache) {
                console.log('[DataStore] 网络不可用，使用缓存数据');
                this.allData = cache.data;
                return cache.data;
            }
            console.log('[DataStore] 无可用数据，返回空数据');
            this.allData = JSON.parse(JSON.stringify(this.DEFAULT_DATA));
            return this.allData;
        }
    },

    /**
     * 将数据保存到 LocalStorage
     * @param {Object} data
     */
    saveToLocal: function (data, source) {
        try {
            const cache = {
                timestamp: Date.now(),
                source: source || 'server',
                data: data
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cache));
            console.log('[DataStore] 数据已缓存到 LocalStorage' + (source === 'import' ? '（导入数据）' : ''));
        } catch (e) {
            console.warn('[DataStore] LocalStorage 写入失败:', e);
        }
    },

    /**
     * 从 LocalStorage 读取数据
     * @returns {Object|null}
     */
    loadFromLocal: function () {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return null;

            const cache = JSON.parse(raw);
            // 仅对 server 来源的缓存做过期检查
            if (cache.source !== 'import' && Date.now() - cache.timestamp > this.CACHE_EXPIRY) {
                console.log('[DataStore] 缓存已过期');
                localStorage.removeItem(this.STORAGE_KEY);
                return null;
            }

            return cache;
        } catch (e) {
            console.warn('[DataStore] LocalStorage 读取失败:', e);
            return null;
        }
    },

    /**
     * 获取所有板块列表（按数据中出现顺序）
     * @param {Object} [data] - 数据对象，默认使用 allData
     * @returns {string[]}
     */
    getAllCategories: function (data) {
        const source = data || this.allData;
        if (!source || !source.issues) return [];

        const categories = new Set();
        source.issues.forEach(issue => {
            (issue.news || []).forEach(item => {
                if (item.category) categories.add(item.category);
            });
        });
        return Array.from(categories);
    },

    /**
     * 获取所有公司列表（按字母排序）
     * @param {Object} [data] - 数据对象，默认使用 allData
     * @returns {string[]}
     */
    getAllCompanies: function (data) {
        const source = data || this.allData;
        if (!source || !source.issues) return [];

        const companies = new Set();
        source.issues.forEach(issue => {
            (issue.news || []).forEach(item => {
                if (item.company) companies.add(item.company);
            });
        });
        return Array.from(companies).sort();
    },

    /**
     * 获取所有期数列表（按期号降序）
     * @param {Object} [data] - 数据对象，默认使用 allData
     * @returns {Array<{issueNumber: number, publishDate: string}>}
     */
    getAllIssues: function (data) {
        const source = data || this.allData;
        if (!source || !source.issues) return [];
        return source.issues
            .map(i => ({ issueNumber: i.issueNumber, publishDate: i.publishDate }))
            .sort((a, b) => b.issueNumber - a.issueNumber);
    },

    /**
     * 获取新闻总条数
     * @param {Object} [data] - 数据对象，默认使用 allData
     * @returns {number}
     */
    getTotalCount: function (data) {
        const source = data || this.allData;
        if (!source || !source.issues) return 0;
        let count = 0;
        source.issues.forEach(issue => {
            count += (issue.news || []).length;
        });
        return count;
    },

    /**
     * 清除 LocalStorage 缓存
     */
    clearCache: function () {
        localStorage.removeItem(this.STORAGE_KEY);
        this.allData = null;
        this.filteredData = null;
        console.log('[DataStore] 缓存已清除');
    }
};
