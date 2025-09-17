class UserDashboard {
    constructor() {
        this.polls = [];
        this.userVotes = new Set();
        this.charts = new Map();
        this.currentFilter = 'all';
        this.init();
    }

    async init() {
        // Check authentication
        if (!this.checkAuth()) return;

        // Set up event listeners
        this.setupEventListeners();
        
        // Connect WebSocket
        if (typeof socketService !== 'undefined') {
            socketService.connect();
            socketService.on('pollUpdate', (data) => this.handlePollUpdate(data));
        }

        // Load initial data
        await this.loadPolls();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (!token) {
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

        // Filter options
        document.querySelectorAll('input[name="filter"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.renderPolls();
            });
        });
    }

    async loadPolls() {
        try {
            const polls = await api.get('/polls');
            this.polls = polls;
            
            // Clear previous votes tracking
            this.userVotes.clear();
            
            // Get user's votes to track which polls they've voted on
            const user = JSON.parse(localStorage.getItem('user'));
            
            // Check each poll for user votes
            for (const poll of this.polls) {
                try {
                    // Try to get user's vote for this poll
                    const userVoteResponse = await this.checkUserVote(poll.id);
                    if (userVoteResponse) {
                        this.userVotes.add(poll.id);
                    }
                } catch (error) {
                    // If error (like 404), user hasn't voted on this poll
                    continue;
                }
            }

            this.renderPolls();
        } catch (error) {
            console.error('Failed to load polls:', error);
        }
    }

    async checkUserVote(pollId) {
        try {
            // Use the new endpoint to check if user voted
            const response = await api.get(`/votes/check/${pollId}`);
            return response.hasVoted;
        } catch (error) {
            return false;
        }
    }

    renderPolls() {
        const container = document.getElementById('pollsList');
        container.innerHTML = '';

        // Clear existing charts
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();

        const filteredPolls = this.filterPolls();

        if (filteredPolls.length === 0) {
            container.innerHTML = '<p>No polls found.</p>';
            return;
        }

        filteredPolls.forEach(poll => {
            const pollElement = this.createPollElement(poll);
            container.appendChild(pollElement);
        });
    }

    filterPolls() {
        switch (this.currentFilter) {
            case 'voted':
                return this.polls.filter(poll => this.userVotes.has(poll.id));
            case 'not-voted':
                return this.polls.filter(poll => !this.userVotes.has(poll.id));
            default:
                return this.polls;
        }
    }

    createPollElement(poll) {
        const div = document.createElement('div');
        div.className = 'poll-item';
        const hasVoted = this.userVotes.has(poll.id);

        div.innerHTML = `
            <h3>${poll.question}</h3>
            <p>Total votes: ${poll._count.votes}</p>
            
            ${!hasVoted ? `
                <div class="poll-options">
                    ${poll.options.map(option => `
                        <label class="option-label">
                            <input type="radio" name="poll-${poll.id}" value="${option.id}">
                            ${option.text}
                        </label>
                    `).join('')}
                    <button class="vote-btn" onclick="userDashboard.vote('${poll.id}')">Vote</button>
                </div>
            ` : '<p class="voted-indicator">✓ You have voted</p>'}
            
            <div class="chart-container">
                <canvas id="user-chart-${poll.id}" width="400" height="200"></canvas>
            </div>
        `;

        // Create chart after element is added to DOM
        setTimeout(() => this.createChart(poll), 100);

        // Join WebSocket room for this poll
        if (typeof socketService !== 'undefined') {
            socketService.joinPoll(poll.id);
        }

        return div;
    }

    createChart(poll) {
        const ctx = document.getElementById(`user-chart-${poll.id}`);
        if (!ctx) return;

        const labels = poll.options.map(option => option.text);
        const data = poll.options.map(option => option._count.votes);

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.6)',
                        'rgba(54, 162, 235, 0.6)',
                        'rgba(255, 205, 86, 0.6)',
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(153, 102, 255, 0.6)',
                        'rgba(255, 159, 64, 0.6)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 205, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${context.raw} votes (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        this.charts.set(poll.id, chart);
    }

    async vote(pollId) {
        const selectedOption = document.querySelector(`input[name="poll-${pollId}"]:checked`);
        
        if (!selectedOption) {
            alert('Please select an option');
            return;
        }

        try {
            const response = await api.post('/votes', {
                pollId: pollId,
                optionId: selectedOption.value
            });

            console.log('Vote response:', response); // Debug log

            // Mark as voted
            this.userVotes.add(pollId);
            
            // Update the specific poll data if available in response
            if (response && response.poll) {
                const pollIndex = this.polls.findIndex(p => p.id === pollId);
                if (pollIndex !== -1) {
                    this.polls[pollIndex] = response.poll;
                }
            } else {
                // If no poll data in response, reload the specific poll
                await this.reloadSinglePoll(pollId);
            }
            
            // Re-render polls to show updated state
            this.renderPolls();
            
            alert('Vote submitted successfully!');
        } catch (error) {
            console.error('Vote submission error:', error);
            alert('Failed to submit vote: ' + (error.message || 'Unknown error'));
        }
    }

    async reloadSinglePoll(pollId) {
        try {
            const updatedPoll = await api.get(`/polls/${pollId}`);
            const pollIndex = this.polls.findIndex(p => p.id === pollId);
            if (pollIndex !== -1) {
                this.polls[pollIndex] = updatedPoll;
            }
        } catch (error) {
            console.error('Failed to reload poll:', error);
        }
    }

    handlePollUpdate(data) {
        const chart = this.charts.get(data.pollId);
        if (chart) {
            const newData = data.data.options.map(option => option._count.votes);
            chart.data.datasets[0].data = newData;
            chart.update();
        }

        // Update poll data in memory
        const pollIndex = this.polls.findIndex(p => p.id === data.pollId);
        if (pollIndex !== -1) {
            this.polls[pollIndex] = data.data;
            
            // Update vote count display
            const pollElement = document.querySelector(`.poll-item:nth-child(${pollIndex + 1}) p`);
            if (pollElement) {
                pollElement.textContent = `Total votes: ${data.data._count.votes}`;
            }
        }
    }

    // Method to refresh data
    async refresh() {
        await this.loadPolls();
    }
}

// Initialize user dashboard and make it globally accessible
let userDashboard;
document.addEventListener('DOMContentLoaded', () => {
    userDashboard = new UserDashboard();
});