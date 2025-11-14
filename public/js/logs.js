// Logs page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    loadLogs();
});

async function loadLogs() {
    try {
        const response = await fetch('/api/logs?take=50', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });
        
        // Check if response is HTML (redirect) instead of JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            // Got HTML instead of JSON - likely redirected to login
            if (response.status === 401 || response.redirected) {
                window.location.href = '/login';
                return;
            }
            throw new Error('Received HTML instead of JSON');
        }

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch logs');
        }

        let logs;
        try {
            logs = await response.json();
        } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError);
            const tbody = document.getElementById('logs-table');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to parse response. Please refresh the page.</td></tr>';
            }
            return;
        }

        const tbody = document.getElementById('logs-table');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No logs found</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map((log, index) => {
            const statusClass = log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 
                               log.status === 'FAILED' ? 'bg-red-100 text-red-800' : 
                               'bg-yellow-100 text-yellow-800';
            
            // Response Status
            let responseStatusHtml = '-';
            if (log.responseStatus) {
                const statusColor = log.responseStatus >= 200 && log.responseStatus < 300 ? 'text-green-600 font-semibold' : 
                                   log.responseStatus >= 400 ? 'text-red-600 font-semibold' : 
                                   'text-yellow-600 font-semibold';
                responseStatusHtml = '<span class="' + statusColor + '">' + log.responseStatus + '</span>';
            }
            
            // Action button - only show if there's response body or error
            let actionButton = '';
            if (log.responseBody || log.errorMessage) {
                actionButton = '<button onclick="showResponseModal(' + index + ')" class="px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors">View Details</button>';
            } else {
                actionButton = '<span class="text-gray-400 text-xs">-</span>';
            }

            // Store log data for modal
            if (!window.logsData) {
                window.logsData = [];
            }
            window.logsData[index] = log;

            return '<tr class="hover:bg-gray-50">' +
                '<td class="px-6 py-4 whitespace-nowrap">' +
                    '<div class="text-sm font-medium text-gray-900">' + (log.cronJob?.name || 'Unknown') + '</div>' +
                    '<div class="text-xs text-gray-500">' + (log.cronJob?.endpointUrl || '') + '</div>' +
                '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">' + new Date(log.startedAt).toLocaleString() + '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">' + (log.executionTimeMs ? (log.executionTimeMs / 1000).toFixed(2) + 's' : '-') + '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap">' +
                    '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ' + statusClass + '">' + log.status + '</span>' +
                '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm">' + responseStatusHtml + '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm">' + actionButton + '</td>' +
            '</tr>';
        }).join('');
    } catch (error) {
        console.error('Failed to load logs:', error);
        const tbody = document.getElementById('logs-table');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Failed to load logs</td></tr>';
        }
    }
}

// Show response modal
function showResponseModal(index) {
    const log = window.logsData && window.logsData[index];
    if (!log) return;

    const modal = document.getElementById('responseModal');
    const statusEl = document.getElementById('modal-response-status');
    const bodyEl = document.getElementById('modal-response-body');
    const containerEl = document.getElementById('modal-response-container');
    const copyButton = document.getElementById('modal-copy-button');
    const errorEl = document.getElementById('modal-error-message');
    const errorTextEl = document.getElementById('modal-error-text');

    // Set response status
    if (log.responseStatus) {
        const statusColor = log.responseStatus >= 200 && log.responseStatus < 300 ? 'text-green-600' : 
                           log.responseStatus >= 400 ? 'text-red-600' : 
                           'text-yellow-600';
        statusEl.innerHTML = '<span class="px-3 py-1 rounded-full text-sm font-semibold ' + statusColor + ' bg-opacity-10">HTTP ' + log.responseStatus + '</span>';
    } else {
        statusEl.textContent = '-';
    }

    // Set response body
    // Clear everything first
    bodyEl.textContent = '';
    bodyEl.style.display = 'none';
    
    // Check for error first
    if (log.errorMessage) {
        // Show error message
        containerEl.className = 'rounded-lg overflow-x-auto max-h-96 overflow-y-auto';
        containerEl.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-4">' +
            '<div class="flex items-start">' +
            '<svg class="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">' +
            '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />' +
            '</svg>' +
            '<div class="flex-1">' +
            '<h4 class="text-sm font-semibold text-red-800 mb-2">Error</h4>' +
            '<pre class="text-sm text-red-700 font-mono whitespace-pre-wrap break-words">' + 
            log.errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</pre>' +
            '</div></div></div>';
        if (copyButton) copyButton.style.display = 'none';
    } else if (log.responseBody) {
        let responseStr = typeof log.responseBody === 'string' ? log.responseBody : String(log.responseBody);
        
        // Handle escaped JSON strings (if stored as JSON string in DB)
        if (responseStr.startsWith('"') && responseStr.endsWith('"')) {
            try {
                responseStr = JSON.parse(responseStr);
            } catch {
                // Not JSON, keep as is
            }
        }
        
        const trimmed = responseStr.trim();
        
        // Aggressive HTML detection - check multiple patterns
        const isHtml = trimmed.startsWith('<!DOCTYPE') || 
                      trimmed.startsWith('<!doctype') ||
                      trimmed.startsWith('<!Doctype') ||
                      trimmed.startsWith('<html') ||
                      trimmed.startsWith('<HTML') ||
                      trimmed.startsWith('<Html') ||
                      (trimmed.startsWith('<') && (trimmed.includes('</html>') || trimmed.includes('</HTML>'))) ||
                      (trimmed.includes('<!DOCTYPE') && trimmed.includes('<html'));

        if (isHtml) {
            // It's HTML - show warning, NO HTML CONTENT
            containerEl.className = 'rounded-lg overflow-x-auto max-h-96 overflow-y-auto';
            containerEl.innerHTML = '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">' +
                '<div class="flex items-start">' +
                '<svg class="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">' +
                '<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />' +
                '</svg>' +
                '<div class="flex-1">' +
                '<h4 class="text-sm font-semibold text-yellow-800 mb-1">⚠️ HTML Response Detected</h4>' +
                '<p class="text-sm text-yellow-700">The endpoint returned HTML instead of JSON. This usually means:<br/>• The URL points to a web page instead of an API endpoint<br/>• The endpoint redirected to a login/error page<br/>• The endpoint doesn\'t exist</p>' +
                '</div></div></div>';
            // Hide copy button for HTML responses
            if (copyButton) copyButton.style.display = 'none';
        } else {
            // Reset container for JSON/text responses
            containerEl.className = 'bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto';
            containerEl.innerHTML = '<pre id="modal-response-body" class="text-xs text-gray-100 font-mono whitespace-pre-wrap break-words"></pre>';
            const newBodyEl = document.getElementById('modal-response-body');
            
            if (copyButton) copyButton.style.display = 'block';
            
            // Try to parse as JSON
            try {
                const responseData = JSON.parse(responseStr);
                const formattedJson = JSON.stringify(responseData, null, 2);
                newBodyEl.textContent = formattedJson;
            } catch {
                // Not JSON, show as plain text
                if (trimmed.length > 0) {
                    newBodyEl.textContent = trimmed;
                } else {
                    newBodyEl.textContent = 'Empty response body';
                    newBodyEl.className = 'text-xs text-gray-400 font-mono';
                }
            }
            newBodyEl.style.display = 'block';
        }
    } else {
        // No response body
        containerEl.className = 'rounded-lg overflow-x-auto max-h-96 overflow-y-auto';
        containerEl.innerHTML = '<div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">' +
            '<p class="text-sm text-gray-500">No response body</p>' +
            '</div>';
        if (copyButton) copyButton.style.display = 'none';
    }

    // Hide error message section since we show errors in response body
    errorEl.classList.add('hidden');

    // Store current log index for copy function
    window.currentModalLogIndex = index;

    // Show modal
    modal.classList.remove('hidden');
}

// Close response modal
function closeResponseModal() {
    const modal = document.getElementById('responseModal');
    modal.classList.add('hidden');
}

// Copy response body to clipboard
function copyResponseBody() {
    const log = window.logsData && window.logsData[window.currentModalLogIndex];
    if (!log || !log.responseBody) return;

    // Get the actual response body text (not the formatted display)
    const textToCopy = log.responseBody;
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        // Show feedback
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('bg-green-100', 'text-green-700');
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('bg-green-100', 'text-green-700');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('responseModal');
        if (modal && !modal.classList.contains('hidden')) {
            closeResponseModal();
        }
    }
});

// Make functions available globally
window.showResponseModal = showResponseModal;
window.closeResponseModal = closeResponseModal;
window.copyResponseBody = copyResponseBody;

