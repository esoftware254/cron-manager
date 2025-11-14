/* global io */

// Initialize Socket.io connection
// Use current host and protocol (works for localhost and production)
const socketProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const socketHost = window.location.host;
const socket = io(`${socketProtocol}//${socketHost}/ws`, {
  transports: ['polling', 'websocket'],
  upgrade: true,
  rememberUpgrade: true,
});

socket.on('connect', () => {
    console.log('Connected to WebSocket server');
});

socket.on('execution:started', (data) => {
    console.log('Execution started:', data);
    updateStats();
});

socket.on('execution:completed', (data) => {
    console.log('Execution completed:', data);
    updateStats();
    updateRecentExecutions();
});

// Load stats on page load with a small delay to ensure cookies are available
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure cookies from login redirect are available
    setTimeout(() => {
        updateStats();
        updateRecentExecutions();
    }, 100);
});

async function updateStats() {
    try {
        // Use JWT from cookies for authenticated requests
        const response = await fetch('/stats', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        // Check if response is HTML (redirect) instead of JSON first
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            // Got HTML instead of JSON - likely redirected to login
            // Don't redirect immediately - might be a temporary issue
            console.warn('Received HTML instead of JSON for stats');
            return;
        }

        if (response.status === 401) {
            // Not authenticated - check if we're on a protected page
            // Only redirect if we're not already on login page
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch stats');
        }

        const stats = await response.json();

        const totalJobsEl = document.getElementById('total-jobs');
        const activeJobsEl = document.getElementById('active-jobs');
        const successTodayEl = document.getElementById('success-today');
        const failedTodayEl = document.getElementById('failed-today');
        
        if (totalJobsEl) totalJobsEl.textContent = stats.jobs?.total || 0;
        if (activeJobsEl) activeJobsEl.textContent = stats.jobs?.active || 0;
        if (successTodayEl) successTodayEl.textContent = stats.executions?.successToday || 0;
        if (failedTodayEl) failedTodayEl.textContent = stats.executions?.failedToday || 0;
    } catch (error) {
        console.error('Failed to update stats:', error);
        // If error, check if we need to redirect to login
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            window.location.href = '/login';
        }
    }
}

async function updateRecentExecutions() {
    try {
        const response = await fetch('/api/logs?take=6', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });
        
        // Check if response is HTML (redirect) instead of JSON first
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            // Got HTML instead of JSON - likely redirected to login
            console.warn('Received HTML instead of JSON for logs. Status:', response.status, 'URL:', response.url);
            const container = document.getElementById('recent-executions');
            if (container) {
                container.innerHTML = `
                    <div class="text-center py-8">
                        <p class="text-red-500">Authentication required</p>
                        <p class="text-sm text-gray-500 mt-2">Please refresh the page</p>
                    </div>
                `;
            }
            return;
        }

        if (response.status === 401) {
            // Not authenticated - check if we're on a protected page
            // Only redirect if we're not already on login page
            console.warn('Unauthorized (401) when fetching logs');
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch logs. Status:', response.status, 'Response:', errorText);
            throw new Error(`Failed to fetch logs: ${response.status} ${errorText}`);
        }

        let logs;
        try {
            logs = await response.json();
            console.log('Loaded logs:', logs?.length || 0, 'executions');
        } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError, 'Response text:', await response.text());
            const container = document.getElementById('recent-executions');
            if (container) {
                container.innerHTML = `
                    <div class="text-center py-8">
                        <p class="text-red-500">Failed to parse response</p>
                        <p class="text-sm text-gray-500 mt-2">Please refresh the page</p>
                    </div>
                `;
            }
            return;
        }

        const container = document.getElementById('recent-executions');
        if (!container) {
            console.error('Container element #recent-executions not found');
            return;
        }

        if (!logs || logs.length === 0) {
            console.log('No executions found in response');
            container.innerHTML = `
                <div class="text-center py-8">
                    <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p class="text-gray-500">No executions yet</p>
                    <p class="text-sm text-gray-400 mt-2">Create a cron job to see executions here</p>
                </div>
            `;
            return;
        }

        console.log('Rendering', logs.length, 'executions');
        container.innerHTML = logs.map(log => {
            const status = log.status || 'UNKNOWN';
            const jobName = log.cronJob?.name || 'Unknown Job';
            const startedAt = log.startedAt ? new Date(log.startedAt).toLocaleString() : 'Unknown time';
            const duration = log.executionTimeMs ? `${(log.executionTimeMs / 1000).toFixed(2)}s` : '';
            
            // Response status badge
            let responseStatusBadge = '';
            if (log.responseStatus) {
                const statusColor = log.responseStatus >= 200 && log.responseStatus < 300 ? 'bg-green-100 text-green-700' : 
                                   log.responseStatus >= 400 ? 'bg-red-100 text-red-700' : 
                                   'bg-yellow-100 text-yellow-700';
                responseStatusBadge = `<span class="px-2 py-1 rounded text-xs font-semibold ${statusColor}">HTTP ${log.responseStatus}</span>`;
            }
            
            // Response body preview - NO HTML, only JSON or errors
            let responsePreview = '';
            if (log.errorMessage) {
                const errorPreview = log.errorMessage.length > 80 ? log.errorMessage.substring(0, 80) + '...' : log.errorMessage;
                responsePreview = `<p class="text-xs text-red-600 mt-1 break-all">Error: ${errorPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
            } else if (log.responseBody) {
                const responseStr = typeof log.responseBody === 'string' ? log.responseBody : String(log.responseBody);
                const trimmed = responseStr.trim();
                
                // Check if HTML
                const isHtml = trimmed.startsWith('<!DOCTYPE') || 
                              trimmed.startsWith('<!doctype') ||
                              trimmed.startsWith('<html') ||
                              trimmed.startsWith('<HTML');
                
                if (isHtml) {
                    // Don't show HTML - just show a warning
                    responsePreview = `<p class="text-xs text-yellow-600 mt-1">⚠️ HTML response (not JSON)</p>`;
                } else {
                    // Try to show JSON preview
                    try {
                        const responseData = JSON.parse(responseStr);
                        const responseStrFormatted = JSON.stringify(responseData);
                        const preview = responseStrFormatted.length > 80 ? responseStrFormatted.substring(0, 80) + '...' : responseStrFormatted;
                        responsePreview = `<p class="text-xs text-gray-500 mt-1 font-mono break-all">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
                    } catch {
                        // Not JSON, show plain text preview (but not HTML)
                        const preview = trimmed.length > 80 ? trimmed.substring(0, 80) + '...' : trimmed;
                        responsePreview = `<p class="text-xs text-gray-500 mt-1 break-all">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
                    }
                }
            }
            
            return `
            <div class="flex flex-col p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-3 flex-1 min-w-0">
                        <div class="flex-shrink-0">
                            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full ${status === 'SUCCESS' ? 'bg-green-100' : status === 'FAILED' ? 'bg-red-100' : 'bg-yellow-100'} flex items-center justify-center">
                                <svg class="w-4 h-4 sm:w-5 sm:h-5 ${status === 'SUCCESS' ? 'text-green-600' : status === 'FAILED' ? 'text-red-600' : 'text-yellow-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    ${status === 'SUCCESS' 
                                        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />'
                                        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />'}
                                </svg>
                            </div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm sm:text-base font-semibold text-gray-900 truncate">${jobName}</p>
                            <p class="text-xs sm:text-sm text-gray-500">${startedAt}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        ${responseStatusBadge}
                        <span class="px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${status === 'SUCCESS' ? 'bg-green-100 text-green-800' : status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
                            ${status}
                        </span>
                    </div>
                </div>
                <div class="ml-11 sm:ml-14">
                    ${duration ? `<p class="text-xs text-gray-400">Duration: ${duration}</p>` : ''}
                    ${responsePreview}
                </div>
            </div>
        `;
        }).join('');
    } catch (error) {
        console.error('Failed to update recent executions:', error);
        const container = document.getElementById('recent-executions');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-red-500">Failed to load executions</p>
                    <p class="text-sm text-gray-500 mt-2">Please refresh the page</p>
                </div>
            `;
        }
    }
}

// JWT authentication is handled via cookies
// No need for getToken() function anymore

