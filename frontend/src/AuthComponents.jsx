import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Lock, LogIn, UserPlus, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Panel, Button, Toast } from './ui/primitives/index.js';

// M6 #17 (brand conformance): the AuthModal is a first-impression UI reachable from the title menu.
// It was raw Tailwind palette classes (dark-gray panel, green submit button, blue links, soft radius)
// -- off-brand vs the LOCKED bold-flat design system. Rebuilt on the Panel/Button/Toast primitives +
// theme tokens (same
// pattern as the #7-S2 Death/Victory overlays + TradingInterface). The auth LOGIC is unchanged; only
// the presentation now conforms. lucide outline icons are correct here (app-chrome, not game content).
const FIELD = 'w-full bg-panel-inset border-chrome border-ink rounded-sm pl-10 pr-4 py-3 ' +
  'text-text placeholder:text-text-muted focus:outline-none focus:border-accent';

export const AuthModal = ({ isOpen, onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let result;
      if (isLogin) {
        result = await login(username, password);
      } else {
        result = await register(username, email, password);
      }

      if (result.success) {
        onClose();
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setError('');
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-modal flex items-center justify-center bg-ink/75"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-md mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Panel variant="raise" data-testid="auth-modal" className="relative overflow-hidden p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
              <div className="flex items-center gap-3">
                {isLogin ? <LogIn size={22} className="text-accent" /> : <UserPlus size={22} className="text-accent" />}
                <h2 className="font-display text-xl tracking-wide text-accent uppercase">
                  {isLogin ? 'Welcome Back' : 'Join Crafty'}
                </h2>
              </div>
              <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                <X size={18} />
              </Button>
            </div>

            <div className="p-5">
              <p className="text-text-muted text-sm mb-4">
                {isLogin ? 'Sign in to your account' : 'Create your account'}
              </p>

              {error && (
                <Toast status="danger" className="w-full mb-4 text-sm">
                  {error}
                </Toast>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-text font-medium mb-2 text-sm uppercase tracking-wider">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={FIELD}
                      placeholder="Enter your username"
                      required
                    />
                  </div>
                </div>

                {!isLogin && (
                  <div>
                    <label className="block text-text font-medium mb-2 text-sm uppercase tracking-wider">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={FIELD}
                        placeholder="Enter your email"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-text font-medium mb-2 text-sm uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={FIELD}
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-text-inverse"></div>
                  ) : (
                    <>
                      {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
                      {isLogin ? 'Sign In' : 'Create Account'}
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-text-muted text-sm">
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}
                </p>
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-accent hover:text-accent-raise font-medium mt-1 text-sm"
                >
                  {isLogin ? 'Create one here' : 'Sign in here'}
                </button>
              </div>
            </div>
          </Panel>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
