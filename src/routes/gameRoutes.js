const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { optionalAuth, requireAuth } = require('../middleware/auth');

router.get('/', optionalAuth, gameController.getGamesByGrade);
router.get('/grades', optionalAuth, gameController.getAvailableGrades);
router.get('/all', requireAuth, gameController.getAllGames);
router.get('/multiplayer-leaderboard', optionalAuth, gameController.getMultiplayerLeaderboard);

module.exports = router;
