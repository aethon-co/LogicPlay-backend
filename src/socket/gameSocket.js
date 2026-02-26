const { Server } = require('socket.io');

const rooms = new Map(); // roomId -> { players: [{id, score, name}], currentQuestionIndex: 0, questions: [], timer: null }
const waitingPlayers = []; // [{id, name, socket}]

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
      console.log(`${playerName} joined matchmaking`);
      
      waitingPlayers.push({ id: socket.id, name: playerName, socket });

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
            { id: player1.id, name: player1.name, score: 0, answered: false, lastAnswerIndex: -1 },
            { id: player2.id, name: player2.name, score: 0, answered: false, lastAnswerIndex: -1 }
          ],
          currentQuestionIndex: 0,
          questions: gameQuestions,
          timer: null,
          questionStartTime: 0
        });

        io.to(roomId).emit('match_found', {
          roomId,
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
      const currentQuestion = room.questions[room.currentQuestionIndex];
      
      if (answerIndex === currentQuestion.answer) {
        // Calculate points based on time (max 100, min 10)
        const timeTaken = Date.now() - room.questionStartTime;
        const maxTime = 10000; // 10 seconds
        let points = Math.max(10, Math.floor(100 * (1 - timeTaken / maxTime)));
        
        // First to answer correctly gets a bonus
        const otherPlayer = room.players.find(p => p.id !== socket.id);
        if (!otherPlayer.answered || otherPlayer.lastAnswerIndex !== currentQuestion.answer) {
           points += 50; // Bonus for being first correct
        }
        
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

function sendNextQuestion(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.currentQuestionIndex >= room.questions.length) {
    // Game over
    io.to(roomId).emit('game_over', {
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
    });
    rooms.delete(roomId);
    return;
  }

  room.players.forEach(p => {
    p.answered = false;
    p.lastAnswerIndex = -1;
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
  }, 10000);
}

function endQuestion(io, roomId) {
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
