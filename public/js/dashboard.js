// Dashboard page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
});

async function loadDashboardData() {
    // Load stats
    try {
        const statsResponse = await fetch('/stats', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            document.getElementById('total-jobs').textContent = stats.totalJobs || 0;
            document.getElementById('active-jobs').textContent = stats.activeJobs || 0;
            document.getElementById('success-today').textContent = stats.successToday || 0;
            document.getElementById('failed-today').textContent = stats.failedToday || 0;
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }

    // Load recent executions
    try {
        const logsResponse = await fetch('/logs?take=5', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (logsResponse.ok) {
            const logs = await logsResponse.json();
            renderRecentExecutions(logs);
        }
    } catch (error) {
        console.error('Failed to load recent executions:', error);
    }

    // Set user greeting if available
    // The user data should be available from the server-side rendered template
    // We'll extract it from the page context or use a data attribute
    const userGreeting = document.getElementById('user-greeting');
    if (userGreeting) {
        // Try to get user info from a data attribute or cookie
        const userDataElement = document.querySelector('[data-user-email]');
        if (userDataElement) {
            const userEmail = userDataElement.getAttribute('data-user-email');
            if (userEmail) {
                const userName = userEmail.split('@')[0];
                userGreeting.textContent = ', ' + userName;
            }
        }
    }
}

function renderRecentExecutions(logs) {
    const container = document.getElementById('recent-executions');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No recent executions</div>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const statusClass = log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 
                           log.status === 'FAILED' ? 'bg-red-100 text-red-800' : 
                           'bg-yellow-100 text-yellow-800';
        
        return '<div class="flex items-center justify-between p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors">' +
            '<div class="flex-1 min-w-0">' +
                '<div class="text-sm font-medium text-gray-900 truncate">' + (log.cronJob?.name || 'Unknown Job') + '</div>' +
                '<div class="text-xs text-gray-500 mt-1">' + new Date(log.startedAt).toLocaleString() + '</div>' +
            '</div>' +
            '<div class="flex items-center space-x-4 ml-4">' +
                '<span class="px-2 py-1 text-xs font-semibold rounded-full ' + statusClass + '">' + log.status + '</span>' +
                '<span class="text-xs text-gray-500">' + (log.executionTimeMs ? (log.executionTimeMs / 1000).toFixed(2) + 's' : '-') + '</span>' +
            '</div>' +
        '</div>';
    }).join('');
}

