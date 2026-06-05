// App State
let questions = []; // Will be loaded from questions.json
let currentState = {
    screen: 'login',
    studentName: '',
    studentClass: '',
    currentQuestionIndex: 0,
    answers: [], // Array of originalIndex answers
    startTime: null,
    timerInterval: null,
    totalTimeSeconds: 0,
    timeLimit: 0,
    cheatCount: 0,
    reviewMode: false,
    allowSolve: false
};

const MathFlowCrypto = {
    salt: "mathflow_secret_2026",
    
    async hashAnswer(index) {
        const text = `${index}_${this.salt}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    xorDecrypt(base64String) {
        if (!base64String) return "";
        try {
            const binaryStr = atob(base64String);
            const xordStr = decodeURIComponent(escape(binaryStr));
            let decrypted = "";
            for (let i = 0; i < xordStr.length; i++) {
                const keyChar = this.salt.charCodeAt(i % this.salt.length);
                decrypted += String.fromCharCode(xordStr.charCodeAt(i) ^ keyChar);
            }
            return decrypted;
        } catch (e) {
            console.error("Lỗi giải mã:", e);
            return "Lỗi giải mã lời giải.";
        }
    }
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
    exitReviewBtn: document.getElementById('exit-review-btn'),
    examTime: document.getElementById('exam-time')
};

// Safe wrappers for third-party libraries (handles offline mode or local file access)
function safeCreateIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try {
            lucide.createIcons();
        } catch (e) {
            console.warn("Lucide icons failed to render:", e);
        }
    }
}

function safeRenderMath(element) {
    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        } catch (e) {
            console.warn("KaTeX failed to render:", e);
        }
    }
}

// Initialize Icons
safeCreateIcons();

// --- Core Functions ---

function parseQuestionsData(data) {
    if (Array.isArray(data)) {
        questions = data;
        currentState.allowSolve = false;
    } else {
        questions = data.questions || [];
        currentState.allowSolve = data.allowSolve !== undefined ? data.allowSolve : false;
        
        // Nếu file xuất cấu hình thời gian kiểm tra cố định, áp dụng và vô hiệu hóa thay đổi trên UI
        if (data.timeLimit !== undefined) {
            currentState.timeLimit = data.timeLimit;
            if (elements.examTime) {
                let optionExists = false;
                for (let i = 0; i < elements.examTime.options.length; i++) {
                    if (parseFloat(elements.examTime.options[i].value) === data.timeLimit) {
                        optionExists = true;
                        break;
                    }
                }
                if (!optionExists) {
                    const newOpt = document.createElement('option');
                    newOpt.value = data.timeLimit;
                    newOpt.textContent = data.timeLimit > 0 ? (data.timeLimit < 1 ? `${data.timeLimit * 60} Giây` : `${data.timeLimit} Phút`) : "Không giới hạn";
                    elements.examTime.appendChild(newOpt);
                }
                elements.examTime.value = data.timeLimit;
                elements.examTime.disabled = true; // Học sinh không được tự chọn
            }
        }
    }
}

// Thuật toán xáo trộn mảng tối giản (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function loadQuestions() {
    if (typeof window.mathflowData === 'undefined') {
        alert("Lỗi: Không tìm thấy dữ liệu câu hỏi mathflowData!");
        return;
    }

    const rawData = window.mathflowData;
    let poolQuestions = rawData.questions || [];
    
    // Đọc cấu hình bảo mật cơ bản
    currentState.allowSolve = rawData.allowSolve || false;
    currentState.timeLimit = rawData.timeLimit ? rawData.timeLimit * 60 : 0;

    // XỬ LÝ MA TRẬN PHÂN TẦNG NATIVE TRÊN TRÌNH DUYỆT (E:NB:TH:VD)
    if (rawData.matrix && poolQuestions.length > 0) {
        const parts = rawData.matrix.split(':').map(Number);
        let reqE = 0, reqNB = 0, reqTH = 0, reqVD = 0;

        if (parts.length === 4) {
            // Định dạng nâng cấp: E : NB : TH : VD
            [reqE, reqNB, reqTH, reqVD] = parts;
        } else if (parts.length === 3) {
            // Định dạng tương thích cũ: NB : TH : VD (E mặc định = 0)
            [reqNB, reqTH, reqVD] = parts;
        }

        // Gom các nhóm theo level
        const buckets = { 'E': [], 'NB': [], 'TH': [], 'VD': [] };
        poolQuestions.forEach(q => {
            const lvl = (q.metadata && q.metadata.level ? q.metadata.level.toUpperCase() : 'NB');
            if (buckets[lvl]) {
                buckets[lvl].push(q);
            } else {
                buckets['NB'].push(q); // Fallback
            }
        });

        let finalSelected = [];
        const config = [
            { key: 'E', req: reqE },
            { key: 'NB', req: reqNB },
            { key: 'TH', req: reqTH },
            { key: 'VD', req: reqVD }
        ];

        config.forEach(item => {
            let available = buckets[item.key];
            shuffleArray(available); // Xáo trộn nội bộ tầng của máy học sinh đó
            
            if (available.length < item.req) {
                console.warn(`Không đủ câu hỏi nhóm ${item.key}. Có: ${available.length}, Cần: ${item.req}`);
                finalSelected = finalSelected.concat(available);
            } else {
                finalSelected = finalSelected.concat(available.slice(0, item.req));
            }
        });

        // Trộn tổng hợp một lần cuối để xáo thứ tự các câu đan xen nhau tự nhiên
        questions = shuffleArray(finalSelected);
    } else {
        // Fallback: Nếu không có ma trận, lấy toàn bộ kho đề và trộn ngẫu nhiên phẳng
        questions = shuffleArray([...poolQuestions]);
    }

    // Khởi tạo mảng đáp án trống tương ứng với số câu đã bốc
    currentState.answers = new Array(questions.length).fill(null);
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    currentState.screen = screenName;
    safeCreateIcons();
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
            if (q.options && q.options.length > 0 && typeof q.options[0] === 'string') {
                const optionsWithIndices = q.options.map((opt, i) => ({ text: opt, originalIndex: i }));
                shuffleArray(optionsWithIndices);
                q.options = optionsWithIndices;
            }
        });
    }

    currentState.studentName = name;
    currentState.studentClass = classInfo;
    currentState.startTime = new Date();
    currentState.reviewMode = false;
    currentState.timeLimit = parseFloat(elements.examTime.value) || 0;

    // Re-initialize answers array with the correct length
    currentState.answers = Array(questions.length).fill(null);
    currentState.currentQuestionIndex = 0;
    currentState.totalTimeSeconds = 0;
    currentState.cheatCount = 0;

    // Kích hoạt chế độ chống sao chép
    document.body.classList.add('no-select');

    showScreen('quiz');
    renderQuestion();
    startTimer();

    // Lưu trạng thái làm bài ban đầu
    saveStateToLocalStorage();
}

function startTimer() {
    const startTime = Date.now();
    
    // Reset timer styles
    elements.timer.style.color = "";
    elements.timer.style.fontWeight = "";
    elements.timer.classList.remove("pulse-warning");

    if (currentState.timeLimit === 0) {
        currentState.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            currentState.totalTimeSeconds = elapsed;
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            elements.timer.textContent = `${mins}:${secs}`;
        }, 1000);
    } else {
        const totalDurationSeconds = currentState.timeLimit * 60;
        currentState.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            currentState.totalTimeSeconds = elapsed;
            
            const remaining = totalDurationSeconds - elapsed;
            if (remaining <= 0) {
                clearInterval(currentState.timerInterval);
                elements.timer.textContent = "00:00";
                alert("Hết thời gian làm bài! Hệ thống sẽ tự động nộp bài.");
                submitQuiz();
                return;
            }
            
            const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
            const secs = (remaining % 60).toString().padStart(2, '0');
            elements.timer.textContent = `${mins}:${secs}`;
            
            if (remaining <= 60) {
                elements.timer.style.color = "var(--error)";
                elements.timer.style.fontWeight = "bold";
                elements.timer.classList.add("pulse-warning");
            }
        }, 1000);
    }
}

let qTextEl, optsListEl, explainBoxEl, explainTitleEl, explainContentEl;

function initSkeletonDOM() {
    elements.questionContainer.innerHTML = `
        <div class="question-card">
            <div id="q-text" class="question-text"></div>
            <div id="opts-list" class="options-list"></div>
            <div id="explain-box" class="explanation-box hidden">
                <div id="explain-title" class="explanation-title"></div>
                <div id="explain-content" class="explanation-content"></div>
            </div>
        </div>
    `;
    qTextEl = document.getElementById('q-text');
    optsListEl = document.getElementById('opts-list');
    explainBoxEl = document.getElementById('explain-box');
    explainTitleEl = document.getElementById('explain-title');
    explainContentEl = document.getElementById('explain-content');

    // Event delegation for option items
    optsListEl.addEventListener('click', (e) => {
        if (currentState.reviewMode) return;
        
        const item = e.target.closest('.option-item');
        if (!item || item.classList.contains('hidden')) return;

        const index = currentState.currentQuestionIndex;
        const origIndex = parseInt(item.getAttribute('data-original-index'));
        currentState.answers[index] = origIndex;

        // Cập nhật giao diện lựa chọn
        optsListEl.querySelectorAll('.option-item').forEach(opt => {
            opt.classList.remove('selected');
        });
        item.classList.add('selected');

        // Lưu đáp án vào bộ nhớ tạm
        saveStateToLocalStorage();
    });
}

function renderQuestion() {
    const index = currentState.currentQuestionIndex;
    const q = questions[index];

    // Update Progress
    const progress = ((index + 1) / questions.length) * 100;
    elements.progressBar.style.width = `${progress}%`;
    elements.questionNumber.textContent = `Câu ${index + 1}/${questions.length}`;

    // Ensure skeleton is initialized
    if (!qTextEl) {
        initSkeletonDOM();
    }

    // Update question content
    qTextEl.innerHTML = q.content;

    // Adjust the number of option elements to match q.options.length
    let optionEls = optsListEl.querySelectorAll('.option-item');
    while (optionEls.length < q.options.length) {
        const item = document.createElement('div');
        item.className = 'option-item';
        item.innerHTML = `
            <div class="option-radio"></div>
            <div class="option-content"></div>
        `;
        optsListEl.appendChild(item);
        optionEls = optsListEl.querySelectorAll('.option-item');
    }

    // Hide extra options if any
    for (let i = 0; i < optionEls.length; i++) {
        if (i < q.options.length) {
            optionEls[i].classList.remove('hidden');
        } else {
            optionEls[i].classList.add('hidden');
        }
    }

    // Update option contents and states
    q.options.forEach((optObj, i) => {
        const item = optionEls[i];
        item.setAttribute('data-original-index', optObj.originalIndex);
        
        const contentEl = item.querySelector('.option-content');
        contentEl.innerHTML = optObj.text;

        // Reset classes
        item.className = 'option-item';
        
        let statusClass = '';
        if (currentState.reviewMode) {
            if (optObj.originalIndex === q.correctOriginalIndex) statusClass = 'correct';
            else if (currentState.answers[index] === optObj.originalIndex) statusClass = 'incorrect';
        }
        
        if (statusClass) {
            item.classList.add(statusClass);
        }
        if (currentState.answers[index] === optObj.originalIndex) {
            item.classList.add('selected');
        }
    });

    // Update explanation box
    if (currentState.reviewMode) {
        if (q.explanation) {
            explainBoxEl.classList.remove('hidden');
            explainTitleEl.innerHTML = `<i data-lucide="info"></i> Giải thích chi tiết:`;
            explainContentEl.innerHTML = MathFlowCrypto.xorDecrypt(q.explanation);
        } else {
            explainBoxEl.classList.remove('hidden');
            const correctOptText = q.options.find(o => o.originalIndex === q.correctOriginalIndex)?.text || '';
            explainTitleEl.innerHTML = `<i data-lucide="check-circle"></i> Đáp án đúng là: ${correctOptText}`;
            explainContentEl.innerHTML = '';
        }
    } else {
        explainBoxEl.classList.add('hidden');
    }

    // Render LaTeX on local components
    if (typeof renderMathInElement !== 'undefined') {
        safeRenderMath(qTextEl);
        q.options.forEach((_, i) => {
            safeRenderMath(optionEls[i].querySelector('.option-content'));
        });
        if (currentState.reviewMode) {
            safeRenderMath(explainBoxEl);
        }
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
    safeCreateIcons();
}

function nextQuestion() {
    if (currentState.currentQuestionIndex < questions.length - 1) {
        currentState.currentQuestionIndex++;
        renderQuestion();
        saveStateToLocalStorage();
    }
}

function prevQuestion() {
    if (currentState.currentQuestionIndex > 0) {
        currentState.currentQuestionIndex--;
        renderQuestion();
        saveStateToLocalStorage();
    }
}

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyKfePtv4VUWkLkptih8B9DEJnvFV10QBrGQYIWpTdaFQNzsR6EbPtoqXJq1o5QDkd2/exec';

async function submitQuiz() {
    clearInterval(currentState.timerInterval);

    // Xóa bộ nhớ lưu nháp bài thi
    clearLocalStorageState();

    // Thoát chế độ toàn màn hình
    if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
        document.exitFullscreen().catch(err => console.error("Lỗi khi thoát toàn màn hình:", err));
    }

    // Tắt chế độ chống sao chép
    document.body.classList.remove('no-select');

    // Calculate Score using Promise.all to break async waterfall
    const verificationPromises = currentState.answers.map(async (ans, idx) => {
        if (ans === null || ans === undefined) return false;
        const hash = await MathFlowCrypto.hashAnswer(ans);
        return hash === questions[idx].answer;
    });
    const results = await Promise.all(verificationPromises);
    const score = results.filter(Boolean).length;

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

    // Ẩn hoặc hiển thị nút Xem lại bài làm dựa trên allowSolve
    if (currentState.allowSolve) {
        elements.reviewBtn.classList.remove('hidden');
    } else {
        elements.reviewBtn.classList.add('hidden');
    }

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
    safeCreateIcons();
}

async function enterReviewMode() {
    // Bảo mật kép: Chặn truy cập nếu giáo viên đã khóa tính năng xem giải
    if (!currentState.allowSolve) {
        alert("Tính năng xem lại bài làm đã bị giáo viên khóa cho bài thi này.");
        return;
    }
    
    // Pre-calculate correct indices
    for (let q of questions) {
        if (q.options) {
            for (let i = 0; i < q.options.length; i++) {
                if (await MathFlowCrypto.hashAnswer(i) === q.answer) {
                    q.correctOriginalIndex = i;
                    break;
                }
            }
        }
    }
    
    currentState.reviewMode = true;
    currentState.currentQuestionIndex = 0;
    showScreen('quiz');
    renderQuestion();
}

function exitReview() {
    currentState.reviewMode = false;
    showScreen('result');
}

// --- Security & Fullscreen Helpers ---
async function enterFullscreen() {
    try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
            await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
            await docEl.msRequestFullscreen();
        }
    } catch (err) {
        console.error("Lỗi khi vào chế độ toàn màn hình:", err);
    }
}

function setupSecurityRestrictions() {
    // Chặn chuột phải
    document.addEventListener('contextmenu', (e) => {
        if (currentState.screen === 'quiz' && !currentState.reviewMode) {
            e.preventDefault();
            alert("Tính năng chuột phải bị vô hiệu hóa trong phòng thi!");
        }
    });

    // Chặn phím tắt sao chép, cắt, dán, in, devtools
    document.addEventListener('keydown', (e) => {
        if (currentState.screen === 'quiz' && !currentState.reviewMode) {
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            
            if (ctrlOrMeta && ['c', 'x', 'v', 'u', 'p', 's'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                alert("Hành động sao chép/in ấn/lưu trữ bị chặn để bảo mật đề thi!");
            }
            
            if (e.key === 'F12' || (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))) {
                e.preventDefault();
                alert("Vui lòng không mở Công cụ nhà phát triển trong phòng thi!");
            }
        }
    });
}

// --- LocalStorage State Management ---
let saveStateTimeout = null;

function saveStateToLocalStorage() {
    if (currentState.screen === 'quiz' && !currentState.reviewMode) {
        if (saveStateTimeout) {
            clearTimeout(saveStateTimeout);
        }
        saveStateTimeout = setTimeout(() => {
            const stateToSave = {
                quiz_id: (window.mathflowData && window.mathflowData.matrix) || "mathflow_default_quiz",
                studentName: currentState.studentName,
                studentClass: currentState.studentClass,
                current_index: currentState.currentQuestionIndex,
                answers: currentState.answers,
                startTime: currentState.startTime ? currentState.startTime.getTime() : null,
                timeLimit: currentState.timeLimit,
                cheatCount: currentState.cheatCount,
                savedAt: Date.now(),
                question_sequence: questions.map(q => ({
                    id: q.id,
                    opts: q.options.map(o => o.originalIndex)
                }))
            };
            localStorage.setItem('mathflow_state', JSON.stringify(stateToSave));
            saveStateTimeout = null;
        }, 300);
    }
}

function clearLocalStorageState() {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout);
        saveStateTimeout = null;
    }
    localStorage.removeItem('mathflow_state');
}

function restoreQuiz(data) {
    // Reconstruct questions sequence from master list to minimize localStorage storage size
    const rawQuestions = (window.mathflowData && window.mathflowData.questions) || [];
    questions = data.question_sequence.map(seqItem => {
        const originalQ = rawQuestions.find(q => q.id === seqItem.id);
        if (!originalQ) return null;
        
        const qCopy = JSON.parse(JSON.stringify(originalQ));
        if (qCopy.options && qCopy.options.length > 0) {
            qCopy.options = seqItem.opts.map(origIdx => {
                const optVal = qCopy.options[origIdx];
                return {
                    text: typeof optVal === 'string' ? optVal : (optVal.text || ""),
                    originalIndex: origIdx
                };
            });
        }
        return qCopy;
    }).filter(q => q !== null);

    currentState.studentName = data.studentName;
    currentState.studentClass = data.studentClass;
    currentState.currentQuestionIndex = data.current_index;
    currentState.answers = data.answers;
    currentState.startTime = new Date(data.startTime);
    currentState.timeLimit = data.timeLimit;
    currentState.cheatCount = data.cheatCount;
    currentState.reviewMode = false;

    // Bật chế độ chống sao chép
    document.body.classList.add('no-select');

    showScreen('quiz');
    renderQuestion();
    startTimer();
}

function checkSavedState() {
    const saved = localStorage.getItem('mathflow_state');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            // Kiểm tra tính hợp lệ và thời gian lưu (dưới 4 tiếng)
            if (data && data.studentName && (Date.now() - data.savedAt < 4 * 60 * 60 * 1000)) {
                setTimeout(() => {
                    const confirmRestore = confirm(`Phát hiện bài làm chưa hoàn thành của học sinh ${data.studentName} (Lớp ${data.studentClass}). Bạn có muốn tiếp tục làm bài không?`);
                    if (confirmRestore) {
                        restoreQuiz(data);
                    } else {
                        clearLocalStorageState();
                    }
                }, 500);
            } else {
                clearLocalStorageState();
            }
        } catch (e) {
            console.error("Lỗi khôi phục trạng thái:", e);
            clearLocalStorageState();
        }
    }
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

// --- Cheating Detection & Screen Lock ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentState.screen === 'quiz' && !currentState.reviewMode) {
        currentState.cheatCount++;
        saveStateToLocalStorage();
        
        const overlay = document.getElementById('cheat-overlay');
        if (overlay) overlay.classList.add('active');
        
        if (currentState.cheatCount >= 3) {
            alert(`Cảnh báo lần ${currentState.cheatCount}: Bạn đã rời tab làm bài quá nhiều lần! Hệ thống tự động thu bài.`);
            if (overlay) overlay.classList.remove('active');
            submitQuiz();
        } else {
            alert(`Cảnh báo lần ${currentState.cheatCount}: Bạn đã rời tab làm bài!`);
            if (overlay) overlay.classList.remove('active');
        }
    }
});

// Sự kiện thay đổi trạng thái toàn màn hình (Đã loại bỏ theo yêu cầu của giáo viên)
/*
document.addEventListener('fullscreenchange', () => {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (!isFullscreen && currentState.screen === 'quiz' && !currentState.reviewMode) {
        currentState.cheatCount++;
        saveStateToLocalStorage();
        alert("Cảnh báo: Bạn đã thoát chế độ toàn màn hình! Hành vi này được coi là một lần gian lận.");
        enterFullscreen(); // Cố gắng phục hồi toàn màn hình
    }
});
*/

// Khởi chạy chế độ bảo mật và kiểm tra bài thi chưa hoàn thành
setupSecurityRestrictions();
checkSavedState();
loadQuestions();
