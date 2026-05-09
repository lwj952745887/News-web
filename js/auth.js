/**
 * auth.js - 密码验证与会话管理
 * SHA-256 哈希验证 + LocalStorage 会话 + 失败锁定
 * 
 * 调试小技巧：
 * - 忘记密码/被锁定时，在浏览器 DevTools 控制台执行：
 *   localStorage.clear(); location.reload();
 * - 重置后默认密码为: admin
 */

const Auth = {
    /** 会话存储键名 */
    SESSION_KEY: 'news_app_session',

    /** 锁定计数键名 */
    LOCK_KEY: 'news_app_lock',

    /** 默认密码哈希（密码: admin） */
    PASSWORD_HASH: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',

    /** 会话有效期（毫秒） */
    SESSION_DURATION: 24 * 60 * 60 * 1000,

    /** 锁定持续时间（毫秒） */
    LOCK_DURATION: 15 * 60 * 1000,

    /** 最大失败次数 */
    MAX_ATTEMPTS: 5,

    /**
     * SHA-256 哈希
     * @param {string} message
     * @returns {Promise<string>}
     */
    hash: async function (message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * 验证密码
     * @param {string} password
     * @returns {Promise<boolean>}
     */
    verify: async function (password) {
        const hash = await this.hash(password);
        return hash === this.PASSWORD_HASH;
    },

    /**
     * 创建会话
     */
    createSession: function () {
        const session = {
            token: 'authenticated',
            timestamp: Date.now()
        };
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        // 清除失败计数
        localStorage.removeItem(this.LOCK_KEY);
    },

    /**
     * 检查是否已登录（会话未过期）
     * @returns {boolean}
     */
    isLoggedIn: function () {
        try {
            const data = localStorage.getItem(this.SESSION_KEY);
            if (!data) return false;
            const session = JSON.parse(data);
            const elapsed = Date.now() - session.timestamp;
            return elapsed < this.SESSION_DURATION;
        } catch {
            return false;
        }
    },

    /**
     * 登出
     */
    logout: function () {
        localStorage.removeItem(this.SESSION_KEY);
    },

    /**
     * 检查是否被锁定
     * @returns {{ locked: boolean, remainingMinutes: number }}
     */
    isLocked: function () {
        try {
            const data = localStorage.getItem(this.LOCK_KEY);
            if (!data) return { locked: false, remainingMinutes: 0 };
            const lock = JSON.parse(data);
            const elapsed = Date.now() - lock.timestamp;
            if (elapsed >= this.LOCK_DURATION) {
                localStorage.removeItem(this.LOCK_KEY);
                return { locked: false, remainingMinutes: 0 };
            }
            const remaining = Math.ceil((this.LOCK_DURATION - elapsed) / 60000);
            return { locked: true, remainingMinutes: remaining };
        } catch {
            return { locked: false, remainingMinutes: 0 };
        }
    },

    /**
     * 清除锁定状态（调试用）
     */
    clearLockout: function () {
        localStorage.removeItem(this.LOCK_KEY);
        console.log('[Auth] 锁定状态已清除');
    },

    /**
     * 记录失败尝试
     * @returns {{ locked: boolean, remainingMinutes: number, attemptsLeft: number }}
     */
    recordFailedAttempt: function () {
        let count = 1;
        try {
            const data = localStorage.getItem(this.LOCK_KEY);
            if (data) {
                const lock = JSON.parse(data);
                const elapsed = Date.now() - lock.timestamp;
                if (elapsed < this.LOCK_DURATION) {
                    count = lock.count + 1;
                }
            }
        } catch {}

        if (count >= this.MAX_ATTEMPTS) {
            localStorage.setItem(this.LOCK_KEY, JSON.stringify({
                count: count,
                timestamp: Date.now()
            }));
            return { locked: true, remainingMinutes: 15, attemptsLeft: 0 };
        }

        localStorage.setItem(this.LOCK_KEY, JSON.stringify({
            count: count,
            timestamp: Date.now()
        }));
        return { locked: false, remainingMinutes: 0, attemptsLeft: this.MAX_ATTEMPTS - count };
    },

    /**
     * 修改密码
     * @param {string} newPassword
     */
    setPassword: async function (newPassword) {
        if (!newPassword || newPassword.length < 4) return false;
        this.PASSWORD_HASH = await this.hash(newPassword);
        return true;
    }
};
