/* ============================================================
   Session Manager — Isolates sensitive data per session.
   Each session has its own placeholder engine and data.
   Never shares sensitive data across sessions.
   ============================================================ */

const SessionManager = (() => {
    'use strict';

    // Active sessions stored in memory only
    const sessions = new Map();
    let currentSessionId = null;

    /**
     * Generate a cryptographically random session ID.
     * @returns {string}
     */
    function generateId() {
        if (window.crypto && window.crypto.randomUUID) {
            return window.crypto.randomUUID();
        }
        // Fallback for older browsers
        return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Create a new session.
     * @returns {string} The new session ID
     */
    function create() {
        const id = generateId();
        sessions.set(id, {
            id: id,
            createdAt: Date.now(),
            placeholderEngine: PlaceholderEngine.createInstance(),
            detections: [],
            contextAnalysis: [],
            userDecisions: {},
            sanitizedPrompt: null,
            originalPrompt: null,
            llmResponse: null,
            mode: PrivacyPolicy.getMode(),
            destroyed: false
        });
        currentSessionId = id;
        return id;
    }

    /**
     * Get the current session.
     * Creates one if none exists.
     * @returns {Object} Session data
     */
    function getCurrent() {
        if (!currentSessionId || !sessions.has(currentSessionId)) {
            create();
        }
        return sessions.get(currentSessionId);
    }

    /**
     * Get a session by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    function getById(id) {
        return sessions.get(id) || null;
    }

    /**
     * Destroy a specific session — clears all sensitive data.
     * @param {string} id
     */
    function destroy(id) {
        const session = sessions.get(id);
        if (!session) return;

        // Destroy placeholder engine (overwrites values)
        if (session.placeholderEngine) {
            session.placeholderEngine.destroy();
        }

        // Clear all sensitive fields
        session.detections = [];
        session.contextAnalysis = [];
        session.userDecisions = {};
        session.sanitizedPrompt = null;
        session.originalPrompt = null;
        session.llmResponse = null;
        session.destroyed = true;

        sessions.delete(id);

        if (currentSessionId === id) {
            currentSessionId = null;
        }
    }

    /**
     * Destroy the current session.
     */
    function destroyCurrent() {
        if (currentSessionId) {
            destroy(currentSessionId);
        }
    }

    /**
     * Destroy all sessions — full cleanup.
     */
    function destroyAll() {
        for (const [id] of sessions) {
            destroy(id);
        }
        sessions.clear();
        currentSessionId = null;
    }

    /**
     * Get active session count.
     * @returns {number}
     */
    function getActiveCount() {
        return sessions.size;
    }

    return {
        create,
        getCurrent,
        getById,
        destroy,
        destroyCurrent,
        destroyAll,
        getActiveCount
    };
})();
