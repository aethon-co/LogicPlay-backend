const { Server } = require('socket.io');
const db = require('../config/db');

const rooms = new Map(); // roomId -> { players: [{id, userId, score, name}], ... }
const waitingPlayers = []; // [{id, userId, name, socket}]

const QUESTIONS = [
  { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], answer: 1 },
  { question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], answer: 2 },
  { question: "Which planet is known as the Red Planet?", options: ["Earth", "Mars", "Jupiter", "Saturn"], answer: 1 },
  { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { question: "Who wrote 'Romeo and Juliet'?", options: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"], answer: 1 },
  { question: "What is the chemical symbol for water?", options: ["H2O", "O2", "CO2", "NaCl"], answer: 0 },
  { question: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
  { question: "What is the fastest land animal?", options: ["Cheetah", "Lion", "Horse", "Eagle"], answer: 0 },
];

const QUESTION_TIME_LIMIT_MS = 10000;

function calculateMultiplayerPoints(timeTakenMs, { firstCorrect = false } = {}) {
  const safeTime = Math.max(0, Math.min(timeTakenMs, QUESTION_TIME_LIMIT_MS));
  const speedPoints = Math.max(
    20,
    Math.round(80 * (1 - safeTime / QUESTION_TIME_LIMIT_MS)),
  );
  return speedPoints + (firstCorrect ? 25 : 0);
}

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_matchmaking', (data) => {
      const playerName = data?.name || 'Player';
      const userId = data?.userId || null;
      console.log(`${playerName} joined matchmaking (userId: ${userId})`);
      
      waitingPlayers.push({ id: socket.id, userId, name: playerName, socket });

      if (waitingPlayers.length >= 2) {
        const player1 = waitingPlayers.shift();
        const player2 = waitingPlayers.shift();

        const roomId = `room_${Date.now()}`;
        
        player1.socket.join(roomId);
        player2.socket.join(roomId);

        const gameQuestions = shuffle([...QUESTIONS]).slice(0, 8);

        rooms.set(roomId, {
          id: roomId,
          players: [
            { id: player1.id, userId: player1.userId, name: player1.name, score: 0, answered: false, lastAnswerIndex: -1, answeredAt: null },
            { id: player2.id, userId: player2.userId, name: player2.name, score: 0, answered: false, lastAnswerIndex: -1, answeredAt: null }
          ],
          currentQuestionIndex: 0,
          questions: gameQuestions,
          timer: null,
          questionStartTime: 0
        });

        // Emit individually so each player knows their own socket id (myId)
        player1.socket.emit('match_found', {
          roomId,
          myId: player1.id,
          players: [
            { id: player1.id, name: player1.name },
            { id: player2.id, name: player2.name }
          ]
        });
        player2.socket.emit('match_found', {
          roomId,
          myId: player2.id,
          players: [
            { id: player1.id, name: player1.name },
            { id: player2.id, name: player2.name }
          ]
        });

        setTimeout(() => {
          sendNextQuestion(io, roomId);
        }, 3000); // 3 seconds countdown before first question
      }
    });

    socket.on('submit_answer', (data) => {
      const { roomId, answerIndex } = data;
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player || player.answered) return;

      player.answered = true;
      player.lastAnswerIndex = answerIndex;
      player.answeredAt = Date.now();
      const currentQuestion = room.questions[room.currentQuestionIndex];
      
      if (answerIndex === currentQuestion.answer) {
        const timeTaken = player.answeredAt - room.questionStartTime;
        const firstCorrect = !room.players.some(
          (p) =>
            p.id !== player.id &&
            p.lastAnswerIndex === currentQuestion.answer &&
            typeof p.answeredAt === 'number',
        );
        const points = calculateMultiplayerPoints(timeTaken, { firstCorrect });
        player.score += points;
      }

      // Check if both answered
      if (room.players.every(p => p.answered)) {
        clearTimeout(room.timer);
        endQuestion(io, roomId);
      }
    });

    socket.on('leave_matchmaking', () => {
      console.log('User left matchmaking:', socket.id);
      const index = waitingPlayers.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        waitingPlayers.splice(index, 1);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Remove from matchmaking
      const index = waitingPlayers.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        waitingPlayers.splice(index, 1);
      }

      // Handle disconnect during game
      for (const [roomId, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          io.to(roomId).emit('player_disconnected', { id: socket.id });
          clearTimeout(room.timer);
          rooms.delete(roomId);
          break;
        }
      }
    });
  });
}

async function saveGameResult(players) {
  if (players.length < 2) return;
  const [p1, p2] = players;
  const winner = p1.score > p2.score ? p1 : p2.score > p1.score ? p2 : null;
  const winnerId = winner?.userId || null;

  try {
    await db.query(
      `INSERT INTO multiplayer_history (player1_id, player1_name, player2_id, player2_name, player1_score, player2_score, winner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p1.userId || null, p1.name, p2.userId || null, p2.name, p1.score, p2.score, winnerId]
    );

    // Add actual game score + bonus to leaderboard score
    for (const p of players) {
      if (!p.userId) continue;
      const bonus = winner === null ? 5 : p === winner ? 10 : 2;
      const totalAdd = p.score + bonus;
      await db.query(
        `UPDATE users SET multiplayer_score = COALESCE(multiplayer_score, 0) + $1 WHERE id = $2`,
        [totalAdd, p.userId]
      );
    }
  } catch (err) {
    console.error('Failed to save multiplayer result:', err);
  }
}

async function sendNextQuestion(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.currentQuestionIndex >= room.questions.length) {
    // Game over
    io.to(roomId).emit('game_over', {
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
    });
    // Persist result and update scores
    await saveGameResult(room.players);
    rooms.delete(roomId);
    return;
  }

  room.players.forEach(p => {
    p.answered = false;
    p.lastAnswerIndex = -1;
    p.answeredAt = null;
  });

  const question = room.questions[room.currentQuestionIndex];
  room.questionStartTime = Date.now();

  io.to(roomId).emit('new_question', {
    questionIndex: room.currentQuestionIndex,
    question: question.question,
    options: question.options,
    timeLimit: 10 // 10 seconds
  });

  room.timer = setTimeout(() => {
    endQuestion(io, roomId);
  }, QUESTION_TIME_LIMIT_MS);
}

async function endQuestion(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const question = room.questions[room.currentQuestionIndex];

  io.to(roomId).emit('question_result', {
    correctAnswer: question.answer,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, answered: p.answered, lastAnswerIndex: p.lastAnswerIndex }))
  });

  room.currentQuestionIndex++;

  setTimeout(() => {
    sendNextQuestion(io, roomId);
  }, 3000); // 3 seconds between questions
}

module.exports = { initSocket };
