const express = require('express');
const supabase = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, company } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }

    console.log('🔐 Attempting to create user:', email);

    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || null,
          company: company || null
        }
      }
    });

    if (error) {
      console.error('Signup error:', error);
      return res.status(400).json({
        error: error.message,
        code: error.code || 'SIGNUP_ERROR'
      });
    }

    console.log('✅ User created successfully:', email);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        emailConfirmed: data.user?.email_confirmed_at ? true : false
      },
      session: data.session
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      error: 'Internal server error during signup'
    });
  }
});

/**
 * POST /api/auth/signin
 * Sign in existing user
 */
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    console.log('🔐 Sign in attempt for:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Signin error:', error);
      return res.status(401).json({
        error: error.message,
        code: error.code || 'SIGNIN_ERROR'
      });
    }

    console.log('✅ User signed in successfully:', email);

    res.json({
      success: true,
      message: 'Signed in successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name,
        company: data.user.user_metadata?.company
      },
      session: data.session
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      error: 'Internal server error during signin'
    });
  }
});

/**
 * POST /api/auth/signout
 * Sign out user
 */
router.post('/signout', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Signout error:', error);
      return res.status(400).json({
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Signed out successfully'
    });

  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({
      error: 'Internal server error during signout'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Get additional user profile data
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.user_metadata?.full_name,
        company: profile?.company || user.user_metadata?.company,
        avatarUrl: profile?.avatar_url,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user information'
    });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, company } = req.body;
    const userId = req.user.id;

    // Update user profile
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        email: req.user.email,
        full_name: fullName,
        company: company,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return res.status(400).json({
        error: 'Failed to update profile'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: data
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Internal server error during profile update'
    });
  }
});

module.exports = router;