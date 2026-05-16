// App State
let questions = []; // Will be loaded from questions.json
let currentState = {
    screen: 'login',
    studentName: '',
    studentClass: '',
    currentQuestionIndex: 0,
    answers: Array(questions.length).fill(null),
    startTime: null,
    timerInterval: null,
    totalTimeSeconds: 0,
    cheatCount: 0,
    reviewMode: false
};

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen')
};

const elements = {
    studentName: document.getElementById('student-name'),
    studentClass: document.getElementById('student-class'),
    startBtn: document.getElementById('start-btn'),
    questionContainer: document.getElementById('question-container'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    submitBtn: document.getElementById('submit-btn'),
    progressBar: document.getElementById('progress-bar'),
    questionNumber: document.getElementById('question-number'),
    timer: document.getElementById('timer'),
    finalScore: document.getElementById('final-score'),
    studentSummary: document.getElementById('student-summary'),
    saveFeedbackBtn: document.getElementById('save-feedback-btn'),
    studentFeedback: document.getElementById('student-feedback'),
    finalTime: document.getElementById('final-time'),
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    reviewBtn: document.getElementById('review-btn'),
    exitReviewBtn: document.getElementById('exit-review-btn')
};

// Initialize Icons
lucide.createIcons();

// --- Core Functions ---

async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        questions = await response.json();
        if (questions.length === 0) {
            alert('Không tìm thấy câu hỏi nào!');
        }
    } catch (e) {
        console.error('Lỗi khi tải câu hỏi:', e);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    currentState.screen = screenName;
    lucide.createIcons();
}

async function startQuiz() {
    const name = elements.studentName.value.trim();
    const classInfo = elements.studentClass.value.trim();

    if (!name || !classInfo) {
        alert('Vui lòng nhập đầy đủ thông tin!');
        return;
    }

    await loadQuestions();

    if (questions.length === 0) {
        // Sample fallback if no questions exported
        questions = [
            { id: "demo", content: "Chưa có câu hỏi nào được xuất từ Vault. Vui lòng chạy kịch bản kết nối.", type: "mcq", options: ["Đã hiểu"], answer: 0 }
        ];
    } else {
        // Shuffle Questions
        shuffleArray(questions);
        // Shuffle Options for each question
        questions.forEach(q => {
            const optionsWithIndices = q.options.map((opt, i) => ({ text: opt, originalIndex: i }));
            shuffleArray(optionsWithIndices);
            q.options = optionsWithIndices.map(o => o.text);
            // Update correct answer index
            q.answer = optionsWithIndices.findIndex(o => o.originalIndex === q.answer);
        });
    }

    currentState.studentName = name;
    currentState.studentClass = classInfo;
    currentState.startTime = new Date();
    currentState.reviewMode = false;

    // Re-initialize answers array with the correct length
    currentState.answers = Array(questions.length).fill(null);
    currentState.currentQuestionIndex = 0;
    currentState.totalTimeSeconds = 0;
    currentState.cheatCount = 0;

    showScreen('quiz');
    renderQuestion();
    startTimer();
}

function startTimer() {
    const startTime = Date.now();
    currentState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        currentState.totalTimeSeconds = elapsed;
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        elements.timer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function renderQuestion() {
    const index = currentState.currentQuestionIndex;
    const q = questions[index];

    // Update Progress
    const progress = ((index + 1) / questions.length) * 100;
    elements.progressBar.style.width = `${progress}%`;
    elements.questionNumber.textContent = `Câu ${index + 1}/${questions.length}`;

    // Generate HTML
    let html = `
        <div class="question-card">
            <div class="question-text">${q.content}</div>
            <div class="options-list">
                ${q.options.map((opt, i) => {
                    let statusClass = '';
                    if (currentState.reviewMode) {
                        if (i === q.answer) statusClass = 'correct';
                        else if (currentState.answers[index] === i) statusClass = 'incorrect';
                    } else {
                        if (currentState.answers[index] === i) {
                            const isCorrect = i === q.answer;
                            statusClass = isCorrect ? 'correct' : 'incorrect';
                        }
                    }

                    return `
                        <div class="option-item ${statusClass} ${currentState.answers[index] === i ? 'selected' : ''}" data-index="${i}">
                            <div class="option-radio"></div>
                            <div class="option-content">${opt}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${currentState.reviewMode && q.explanation ? `
                <div class="explanation-box">
                    <div class="explanation-title"><i data-lucide="info"></i> Giải thích chi tiết:</div>
                    <div class="explanation-content">${q.explanation}</div>
                </div>
            ` : ''}
            ${currentState.reviewMode && !q.explanation ? `
                <div class="explanation-box">
                    <div class="explanation-title"><i data-lucide="check-circle"></i> Đáp án đúng là: ${q.options[q.answer]}</div>
                </div>
            ` : ''}
        </div>
    `;

    elements.questionContainer.innerHTML = html;

    // Render LaTeX
    renderMathInElement(elements.questionContainer, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
        ],
        throwOnError: false
    });

    // Add Event Listeners to options
    if (!currentState.reviewMode) {
        document.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', () => {
                // If already answered, don't allow changing for instant feedback mode
                if (currentState.answers[index] !== null) return;

                const optIndex = parseInt(item.dataset.index);
                const isCorrect = optIndex === q.answer;

                currentState.answers[index] = optIndex;

                // Apply visual feedback
                item.classList.add(isCorrect ? 'correct' : 'incorrect');

                if (!isCorrect) {
                    // Highlight the correct answer
                    const correctItem = document.querySelector(`.option-item[data-index="${q.answer}"]`);
                    if (correctItem) correctItem.classList.add('correct-hint');
                }
            });
        });
    }

    // Update Navigation Buttons
    elements.prevBtn.disabled = index === 0;
    
    if (currentState.reviewMode) {
        elements.nextBtn.classList.toggle('hidden', index === questions.length - 1);
        elements.submitBtn.classList.add('hidden');
        elements.exitReviewBtn.classList.remove('hidden');
    } else {
        elements.exitReviewBtn.classList.add('hidden');
        if (index === questions.length - 1) {
            elements.nextBtn.classList.add('hidden');
            elements.submitBtn.classList.remove('hidden');
        } else {
            elements.nextBtn.classList.remove('hidden');
            elements.submitBtn.classList.add('hidden');
        }
    }
    lucide.createIcons();
}

function nextQuestion() {
    if (currentState.currentQuestionIndex < questions.length - 1) {
        currentState.currentQuestionIndex++;
        renderQuestion();
    }
}

function prevQuestion() {
    if (currentState.currentQuestionIndex > 0) {
        currentState.currentQuestionIndex--;
        renderQuestion();
    }
}

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyKfePtv4VUWkLkptih8B9DEJnvFV10QBrGQYIWpTdaFQNzsR6EbPtoqXJq1o5QDkd2/exec';

async function submitQuiz() {
    clearInterval(currentState.timerInterval);

    // Calculate Score
    let score = 0;
    currentState.answers.forEach((ans, i) => {
        if (ans === questions[i].answer) score++;
    });

    const scoreText = `${score}/${questions.length}`;

    // Format Time
    const totalTime = currentState.totalTimeSeconds;
    const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
    const secs = (totalTime % 60).toString().padStart(2, '0');
    const timeText = `${mins}:${secs}`;

    // Format Cheating Info
    const cheatInfo = currentState.cheatCount > 0 ? `Có (${currentState.cheatCount} lần)` : "Không";

    // Show Results
    elements.finalScore.textContent = scoreText;
    if (elements.finalTime) {
        elements.finalTime.textContent = timeText;
    }
    elements.studentSummary.textContent = `${currentState.studentName} - Lớp ${currentState.studentClass}`;

    showScreen('result');

    // Automatically send basic results to Google Sheets
    sendDataToGoogle({
        studentName: currentState.studentName,
        studentClass: currentState.studentClass,
        score: scoreText,
        time: timeText,
        cheated: cheatInfo,
        feedback: "Nộp bài tự động"
    });
}

async function sendDataToGoogle(data) {
    try {
        console.log('Sending data to Google Sheets...', data);
        // Use no-cors mode for Google Apps Script if needed, 
        // but for a teacher's tool, a simple fetch usually works with proper Apps Script setup
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Important for Google Apps Script redirects
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        console.log('Data sent successfully');
    } catch (e) {
        console.error('Error sending data:', e);
    }
}

async function saveFeedback() {
    const feedback = elements.studentFeedback.value.trim();
    if (!feedback) return;

    elements.saveFeedbackBtn.disabled = true;
    elements.saveFeedbackBtn.textContent = "Đang gửi...";

    // Format Time & Cheat info to re-send if needed
    const totalTime = currentState.totalTimeSeconds;
    const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
    const secs = (totalTime % 60).toString().padStart(2, '0');
    const timeText = `${mins}:${secs}`;
    const cheatInfo = currentState.cheatCount > 0 ? `Có (${currentState.cheatCount} lần)` : "Không";

    await sendDataToGoogle({
        studentName: currentState.studentName,
        studentClass: currentState.studentClass,
        score: elements.finalScore.textContent,
        time: timeText,
        cheated: cheatInfo,
        feedback: feedback
    });

    alert(`Cảm ơn ${currentState.studentName}! Ý kiến của bạn đã được gửi tới giáo viên.`);
    elements.saveFeedbackBtn.textContent = "Đã gửi phản hồi";
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    elements.themeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    lucide.createIcons();
}

function enterReviewMode() {
    currentState.reviewMode = true;
    currentState.currentQuestionIndex = 0;
    showScreen('quiz');
    renderQuestion();
}

function exitReview() {
    currentState.reviewMode = false;
    showScreen('result');
}

// --- Event Listeners ---
elements.startBtn.addEventListener('click', startQuiz);
elements.nextBtn.addEventListener('click', nextQuestion);
elements.prevBtn.addEventListener('click', prevQuestion);
elements.submitBtn.addEventListener('click', submitQuiz);
elements.saveFeedbackBtn.addEventListener('click', saveFeedback);
elements.themeToggle.addEventListener('click', toggleTheme);
elements.reviewBtn.addEventListener('click', enterReviewMode);
elements.exitReviewBtn.addEventListener('click', exitReview);

// Enter to start
elements.studentClass.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startQuiz();
});

// --- Cheating Detection ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentState.screen === 'quiz') {
        currentState.cheatCount++;
        alert("Cảnh báo: Bạn đã rời khỏi màn hình làm bài! Hành vi này đã được ghi nhận.");
    }
});
