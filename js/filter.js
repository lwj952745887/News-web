/**
 * filter.js - 筛选逻辑
 * 负责按公司、主题、年份、月份、区域筛选新闻
 */

const Filter = {
    /** 当前筛选条件 */
    state: {
        company: 'all',
        topic: 'all',
        year: 'all',
        month: 'all',
        region: 'all'
    },

    /**
     * 执行筛选
     * 在原 issues 结构上过滤 news 数组
     * @param {Array} issues - data.issues 原始数组
     * @param {Object} [filters] - 筛选条件，默认使用 state
     * @returns {Array} 筛选后的 issues 数组
     */
    apply: function (issues, filters) {
        filters = filters || this.state;
        if (!issues || issues.length === 0) return [];

        // 深拷贝一份，避免修改原始数据
        const result = JSON.parse(JSON.stringify(issues));

        for (let i = result.length - 1; i >= 0; i--) {
            const issue = result[i];
            let newsList = issue.news || [];

            // 1. 年份筛选（从 publishDate 提取年份）
            if (filters.year !== 'all') {
                const yearNum = parseInt(filters.year, 10);
                const pubYear = parseInt(issue.publishDate.substring(0, 4), 10);
                if (pubYear !== yearNum) {
                    result.splice(i, 1);
                    continue;
                }
            }

            // 2. 月份筛选（从 publishDate 提取月份）
            if (filters.month !== 'all') {
                const monthNum = parseInt(filters.month, 10);
                const pubMonth = parseInt(issue.publishDate.substring(5, 7), 10);
                if (pubMonth !== monthNum) {
                    result.splice(i, 1);
                    continue;
                }
            }

            // 3. 公司筛选（去除不可见字符后比较）
            if (filters.company !== 'all') {
                const target = filters.company.trim();
                newsList = newsList.filter(item => {
                    const val = (item.company || '').trim();
                    return val === target;
                });
                // 调试：如果筛选后为空，打印实际公司值
                if (newsList.length === 0) {
                    const allCompanies = [...new Set(result.flatMap(i => (i.news || []).map(n => JSON.stringify(n.company))))];
                    console.log('[Filter] 公司筛选无匹配，目标值:', JSON.stringify(target), '数据中的公司值:', allCompanies);
                }
            }

            // 4. 主题（标签）筛选
            if (filters.topic !== 'all') {
                newsList = newsList.filter(item =>
                    item.tags && item.tags.some(t => t === filters.topic)
                );
            }

            // 5. 区域筛选
            if (filters.region !== 'all') {
                newsList = newsList.filter(item =>
                    item.region === filters.region
                );
            }

            // 更新筛选后的 news 列表
            issue.news = newsList;

            // 如果该期没有匹配的新闻，移除该期
            if (newsList.length === 0) {
                result.splice(i, 1);
            }
        }

        return result;
    },

    /**
     * 更新筛选条件
     * @param {string} key - 条件键名
     * @param {*} value - 条件值
     */
    setFilter: function (key, value) {
        if (this.state.hasOwnProperty(key)) {
            this.state[key] = value;
        }
    },

    /**
     * 重置所有筛选条件为默认值
     */
    reset: function () {
        this.state.company = 'all';
        this.state.topic = 'all';
        this.state.year = 'all';
        this.state.month = 'all';
        this.state.region = 'all';
    }
};
