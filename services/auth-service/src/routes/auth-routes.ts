import express from 'express';
import AuthController from '../controllers/auth-controller.js';
import AuthMiddleware from '../middleware/auth-middleware.js';

export function createAuthRoutes(authController: AuthController, authMiddleware: AuthMiddleware): express.Router {
  const router = express.Router();

  // Apply security headers to all routes
  router.use(authMiddleware.securityHeaders());
  
  // Apply input sanitization
  router.use(authMiddleware.sanitizeInput());
  
  // Apply request logging
  router.use(authMiddleware.requestLogger());

  // Public authentication routes (with rate limiting)
  router.post('/login', 
    authMiddleware.createAuthRateLimit(),
    authController.login.bind(authController)
  );

  router.post('/register',
    authMiddleware.createAuthRateLimit(),
    authController.register.bind(authController)
  );

  router.post('/refresh',
    authMiddleware.createAuthRateLimit(),
    authController.refreshToken.bind(authController)
  );

  // Protected routes (require valid JWT)
  router.use(authMiddleware.verifyToken());

  router.post('/logout',
    authController.logout.bind(authController)
  );

  router.post('/change-password',
    authController.changePassword.bind(authController)
  );

  router.get('/profile',
    authController.getProfile.bind(authController)
  );

  router.get('/validate',
    authController.validateToken.bind(authController)
  );

  // Admin-only routes
  router.get('/users',
    authMiddleware.requireAdmin(),
    authController.getAllUsers.bind(authController)
  );

  router.put('/users/:userId/roles',
    authMiddleware.requireAdmin(),
    authController.updateUserRoles.bind(authController)
  );

  router.delete('/users/:userId',
    authMiddleware.requireAdmin(),
    authController.deactivateUser.bind(authController)
  );

  router.get('/roles',
    authMiddleware.requireAdmin(),
    authController.getRoles.bind(authController)
  );

  router.get('/stats',
    authMiddleware.requireAdmin(),
    authController.getStats.bind(authController)
  );

  return router;
}

export default createAuthRoutes;