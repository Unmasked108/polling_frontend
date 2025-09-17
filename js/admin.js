class AdminDashboard {
    constructor() {
        this.charts = new Map();
        this.polls = [];
        this.init();
    }

    async init() {
        // Check authentication
        if (!this.checkAuth()) return;

        // Set up event listeners
        this.setupEventListeners();
        
        // Connect WebSocket
        socketService.connect();
        socketService.on('pollUpdate', (data) => this.handlePollUpdate(data));

        // Load initial data
        await this.loadPolls();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (!token || user.role !== 'ADMIN') {
            window.location.href = 'index.html';
            return false;
        }

        document.getElementById('userName').textContent = user.name;
        return true;
    }

    setupEventListeners() {
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'index.html';
        });

        // Add option button
        document.getElementById('addOption').addEventListener('click', () => {
            this.addOption();
        });

        // Create poll form
        document.getElementById('createPollForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createPoll();
        });
    }

    addOption() {
        const container = document.getElementById('optionsContainer');
        const optionCount = container.children.length + 1;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'poll-option';
        input.placeholder = `Option ${optionCount}`;
        input.required = true;
        container.appendChild(input);
    }

    async createPoll() {
        const question = document.getElementById('pollQuestion').value;
        const optionInputs = document.querySelectorAll('.poll-option');
        const options = Array.from(optionInputs).map(input => input.value).filter(value => value.trim());

        if (options.length < 2) {
            alert('Please provide at least 2 options');
            return;
        }

        try {
            await api.post('/polls', { question, options });
            alert('Poll created successfully!');
            
            // Reset form
            document.getElementById('createPollForm').reset();
            this.resetOptions();
            
            // Reload polls
            await this.loadPolls();
        } catch (error) {
            alert('Failed to create poll: ' + error.message);
        }
    }

    resetOptions() {
        const container = document.getElementById('optionsContainer');
        container.innerHTML = `
            <input type="text" class="poll-option" placeholder="Option 1" required>
            <input type="text" class="poll-option" placeholder="Option 2" required>
        `;
    }

    async loadPolls() {
        try {
            const polls = await api.get('/polls');
            this.polls = polls;
            this.renderPolls();
        } catch (error) {
            console.error('Failed to load polls:', error);
        }
    }

    renderPolls() {
        const container = document.getElementById('pollsList');
        container.innerHTML = '';

        this.polls.forEach(poll => {
            const pollElement = this.createPollElement(poll);
            container.appendChild(pollElement);
        });
    }

    createPollElement(poll) {
        const div = document.createElement('div');
        div.className = 'poll-item';
        div.innerHTML = `
            <h3>${poll.question}</h3>
            <p>Total votes: ${poll._count.votes}</p>
            <div class="chart-container">
                <canvas id="chart-${poll.id}" width="400" height="200"></canvas>
            </div>
        `;

        // Create chart after element is added to DOM
        setTimeout(() => this.createChart(poll), 0);

        // Join WebSocket room for this poll
        socketService.joinPoll(poll.id);

        return div;
    }

    createChart(poll) {
        const ctx = document.getElementById(`chart-${poll.id}`);
        if (!ctx) return;

        const labels = poll.options.map(option => option.text);
        const data = poll.options.map(option => option._count.votes);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Votes',
                    data: data,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });

        this.charts.set(poll.id, chart);
    }

    handlePollUpdate(data) {
        const chart = this.charts.get(data.pollId);
        if (chart) {
            const newData = data.data.options.map(option => option._count.votes);
            chart.data.datasets[0].data = newData;
            chart.update();
        }
    }
}

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', () => {
    new AdminDashboard();
});