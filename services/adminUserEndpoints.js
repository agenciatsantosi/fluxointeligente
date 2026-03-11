/**
 * Admin User Management Endpoints
 */

/**
 * Get all users with subscription info
 */
export function setupUserEndpoints(app, auth) {
    app.get('/api/admin/users', async (req, res) => {
        try {
            const users = await auth.getAllUsersWithSubscription();
            res.json({ success: true, users });
        } catch (error) {
            console.error('[ADMIN] Error getting users:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * Update user subscription
     */
    app.put('/api/admin/users/:id/subscription', async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            const result = auth.updateUserSubscription(userId, req.body);
            res.json(result);
        } catch (error) {
            console.error('[ADMIN] Error updating subscription:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * Add payment to user
     */
    app.post('/api/admin/users/:id/payment', async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            const { amount } = req.body;
            const result = auth.addUserPayment(userId, amount);
            res.json(result);
        } catch (error) {
            console.error('[ADMIN] Error adding payment:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * Delete user
     */
    app.delete('/api/admin/users/:id', async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            const result = auth.deleteUser(userId);
            res.json(result);
        } catch (error) {
            console.error('[ADMIN] Error deleting user:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * Get subscription statistics
     */
    app.get('/api/admin/subscription-stats', async (req, res) => {
        try {
            const stats = auth.getSubscriptionStats();
            res.json({ success: true, stats });
        } catch (error) {
            console.error('[ADMIN] Error getting subscription stats:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}
