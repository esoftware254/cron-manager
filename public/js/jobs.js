// Jobs page JavaScript
console.log('jobs.js loaded');

// Socket.IO event listeners for real-time job updates
document.addEventListener('DOMContentLoaded', () => {
    // Wait for socket to be initialized (from app.js)
    const initSocketListeners = () => {
        if (!window.socket) {
            // Wait a bit if socket isn't ready yet
            setTimeout(initSocketListeners, 100);
            return;
        }

        // Listen for job created events
        window.socket.on('cron:created', (data) => {
            console.log('Job created:', data);
            // Reload jobs list
            if (typeof window.loadJobs === 'function') {
                window.loadJobs();
            }
        });

        // Listen for job updated events
        window.socket.on('cron:updated', (data) => {
            console.log('Job updated:', data);
            // Reload jobs list to show updated status/next run time
            if (typeof window.loadJobs === 'function') {
                window.loadJobs();
            }
        });

        // Listen for job deleted events
        window.socket.on('cron:deleted', (data) => {
            console.log('Job deleted:', data);
            // Reload jobs list
            if (typeof window.loadJobs === 'function') {
                window.loadJobs();
            }
        });

        // Listen for execution events to update job status
        window.socket.on('execution:started', (data) => {
            console.log('Execution started:', data);
            // Update job status in the table if job is displayed
            updateJobStatus(data.jobId, 'RUNNING');
        });

        window.socket.on('execution:completed', (data) => {
            console.log('Execution completed:', data);
            // Update job status in the table
            updateJobStatus(data.jobId, data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED');
            // Reload jobs to update last run time and next run time
            if (typeof window.loadJobs === 'function') {
                // Small delay to ensure database is updated
                setTimeout(() => window.loadJobs(), 500);
            }
        });
    };

    initSocketListeners();
});

// Helper function to update job status in the table without full reload
function updateJobStatus(jobId, status) {
    // Find the job row and update status badge
    const jobRows = document.querySelectorAll('[data-job-id="' + jobId + '"]');
    jobRows.forEach(row => {
        const statusCell = row.querySelector('.job-status');
        if (statusCell) {
            const statusClasses = {
                'RUNNING': 'bg-yellow-100 text-yellow-800',
                'SUCCESS': 'bg-green-100 text-green-800',
                'FAILED': 'bg-red-100 text-red-800',
                'PENDING': 'bg-gray-100 text-gray-800'
            };
            statusCell.className = 'job-status px-2 py-1 rounded-full text-xs font-semibold ' + (statusClasses[status] || statusClasses['PENDING']);
            statusCell.textContent = status;
        }
    });
}

// Make functions globally available immediately
window.showCreateJobModal = function() {
    console.log('showCreateJobModal called');
    const modal = document.getElementById('createJobModal');
    if (!modal) {
        console.error('Modal element not found!');
        alert('Modal element not found. Please refresh the page.');
        return;
    }
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    console.log('Modal shown');
};

window.closeCreateJobModal = function() {
    console.log('closeCreateJobModal called');
    const modal = document.getElementById('createJobModal');
    if (modal) {
        modal.classList.add('hidden');
        const form = document.getElementById('createJobForm');
        if (form) {
            form.reset();
            // Reset cron preset and validation messages
            const cronPreset = document.getElementById('cronPreset');
            const nextRunDiv = document.getElementById('cronNextRun');
            const errorDiv = document.getElementById('cronError');
            const cronHelpTooltip = document.getElementById('cronHelpTooltip');
            if (cronPreset) cronPreset.value = '';
            if (nextRunDiv) nextRunDiv.classList.add('hidden');
            if (errorDiv) errorDiv.classList.add('hidden');
            if (cronHelpTooltip) cronHelpTooltip.classList.add('hidden');
        }
        document.body.style.overflow = '';
    }
};

window.createJob = async function(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
    }
    console.log('createJob called', e);
    
    const form = e && e.target ? e.target : document.getElementById('createJobForm');
    if (!form) {
        console.error('Form not found!');
        alert('Form not found. Please refresh the page.');
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.isActive = true;
    data.retryCount = 3;
    data.timeoutMs = 30000;
    console.log('Job data:', data);

    const submitBtn = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');

    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = 'Creating...';
    if (submitSpinner) submitSpinner.classList.remove('hidden');

    try {
        const response = await fetch('/cron', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(data),
        });

        console.log('Response status:', response.status);

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            const result = await response.json();
            console.log('Job created successfully:', result);
            window.closeCreateJobModal();
            window.loadJobs();
        } else {
            const error = await response.json();
            console.error('Failed to create job:', error);
            alert(error.message || 'Failed to create job');
        }
    } catch (error) {
        console.error('Failed to create job:', error);
        alert('Failed to create job. Please try again.');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'Create Job';
        if (submitSpinner) submitSpinner.classList.add('hidden');
    }
};

window.loadJobs = async function() {
    try {
        const response = await fetch('/cron', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch jobs');
        }

        const jobs = await response.json();
        renderJobs(jobs);
        // Set up action menus after rendering
        setTimeout(setupActionMenus, 50);
    } catch (error) {
        console.error('Failed to load jobs:', error);
        showError('Failed to load jobs. Please refresh the page.');
    }
};

// Set up action menu dropdowns (3-dots menu)
function setupActionMenus() {
    document.querySelectorAll('.action-menu-btn').forEach(btn => {
        // Skip if already has event listener
        if (btn.dataset.hasListener === 'true') {
            return;
        }
        btn.dataset.hasListener = 'true';
        
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const jobId = this.getAttribute('data-job-id');
            const menu = document.querySelector(`.action-menu[data-menu-id="${jobId}"]`);
            
            if (!menu) return;
            
            // Close all other menus
            document.querySelectorAll('.action-menu').forEach(m => {
                if (m !== menu) {
                    m.classList.add('hidden');
                }
            });
            
            // Toggle current menu
            menu.classList.toggle('hidden');
        });
    });
}

// Close all menus when clicking outside (set up once globally)
if (!window.actionMenuGlobalSetup) {
    window.actionMenuGlobalSetup = true;
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.action-menu-btn') && !e.target.closest('.action-menu')) {
            document.querySelectorAll('.action-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });
    
    // Close menu on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.action-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });
}

function renderJobs(jobs) {
    const tbody = document.getElementById('jobs-table');
    const cardsContainer = document.getElementById('jobs-cards');

    if (!jobs || jobs.length === 0) {
        const emptyState = '<div class="text-center py-12">' +
            '<svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />' +
            '</svg>' +
            '<p class="text-gray-500 text-lg font-medium">No cron jobs found</p>' +
            '<p class="text-sm text-gray-400 mt-2">Create your first cron job to get started</p>' +
            '<button onclick="showCreateJobModal()" class="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">Create Job</button>' +
            '</div>';
        if (tbody) tbody.innerHTML = '<tr><td colspan="7">' + emptyState + '</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div class="bg-white rounded-xl shadow-md p-6 border border-gray-200">' + emptyState + '</div>';
        return;
    }

    // Desktop table
    if (tbody) {
        tbody.innerHTML = jobs.map(job => {
            const statusClass = job.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 
                               job.status === 'FAILED' ? 'bg-red-100 text-red-800' : 
                               job.status === 'RUNNING' ? 'bg-yellow-100 text-yellow-800' : 
                               'bg-gray-100 text-gray-800';
            const activeClass = job.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
            const lastRun = job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : '<span class="text-gray-400">Never</span>';
            const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '<span class="text-gray-400">-</span>';

            return '<tr class="hover:bg-gray-50 transition-colors" data-job-id="' + job.id + '">' +
                '<td class="px-3 py-3" style="max-width: 250px;">' +
                    '<div class="flex items-center min-w-0">' +
                        '<div class="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-xs mr-2">' +
                            job.name.charAt(0).toUpperCase() +
                        '</div>' +
                        '<div class="min-w-0 flex-1">' +
                            '<div class="text-sm font-semibold text-gray-900 truncate" title="' + (job.name || '') + '">' + job.name + '</div>' +
                            '<div class="text-xs text-gray-500 truncate" title="' + (job.description || 'No description') + '">' + (job.description || 'No description') + '</div>' +
                        '</div>' +
                    '</div>' +
                '</td>' +
                '<td class="px-3 py-3">' +
                    '<code class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 font-mono whitespace-nowrap" title="' + job.cronExpression + '">' + job.cronExpression + '</code>' +
                '</td>' +
                '<td class="px-3 py-3" style="max-width: 350px;">' +
                    '<div class="text-xs text-gray-900 font-mono truncate" title="' + job.endpointUrl + '">' + job.endpointUrl + '</div>' +
                    '<div class="text-xs text-gray-500 mt-1">' + job.httpMethod + '</div>' +
                '</td>' +
                '<td class="px-3 py-3">' +
                    '<div class="flex flex-col gap-1">' +
                        '<span class="px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ' + activeClass + ' w-fit">' +
                            (job.isActive ? 'Active' : 'Inactive') +
                        '</span>' +
                        '<span class="job-status px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ' + statusClass + ' w-fit">' +
                            (job.status || 'PENDING') +
                        '</span>' +
                    '</div>' +
                '</td>' +
                '<td class="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">' + lastRun + '</td>' +
                '<td class="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">' + nextRun + '</td>' +
                '<td class="px-3 py-3 text-right">' +
                    '<div class="relative inline-block text-left">' +
                        '<button type="button" class="action-menu-btn p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" data-job-id="' + job.id + '" aria-label="Actions">' +
                            '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">' +
                                '<path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>' +
                            '</svg>' +
                        '</button>' +
                        '<div class="action-menu hidden absolute right-0 mt-1 w-40 bg-white rounded-md shadow-xl ring-1 ring-black ring-opacity-5 py-1" data-menu-id="' + job.id + '" style="z-index: 50;">' +
                            '<button type="button" onclick="toggleJob(\'' + job.id + '\')" class="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors">' +
                                '<span class="flex items-center">' +
                                    '<svg class="w-4 h-4 mr-2 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />' +
                                    '</svg>' +
                                    '<span>' + (job.isActive ? 'Disable' : 'Enable') + '</span>' +
                                '</span>' +
                            '</button>' +
                            '<button type="button" onclick="executeJob(\'' + job.id + '\')" class="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors">' +
                                '<span class="flex items-center">' +
                                    '<svg class="w-4 h-4 mr-2 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />' +
                                    '</svg>' +
                                    '<span>Execute</span>' +
                                '</span>' +
                            '</button>' +
                            '<button type="button" onclick="deleteJob(\'' + job.id + '\')" class="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">' +
                                '<span class="flex items-center">' +
                                    '<svg class="w-4 h-4 mr-2 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />' +
                                    '</svg>' +
                                    '<span>Delete</span>' +
                                '</span>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // Mobile cards
    if (cardsContainer) {
        cardsContainer.innerHTML = jobs.map(job => {
            const statusClass = job.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 
                               job.status === 'FAILED' ? 'bg-red-100 text-red-800' : 
                               job.status === 'RUNNING' ? 'bg-yellow-100 text-yellow-800' : 
                               'bg-gray-100 text-gray-800';
            const activeClass = job.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
            const lastRun = job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'Never';
            const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '-';

            return '<div class="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200" data-job-id="' + job.id + '">' +
                '<div class="flex items-start justify-between mb-4">' +
                    '<div class="flex items-center space-x-3 flex-1 min-w-0">' +
                        '<div class="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold">' +
                            job.name.charAt(0).toUpperCase() +
                        '</div>' +
                        '<div class="flex-1 min-w-0">' +
                            '<h3 class="text-sm sm:text-base font-semibold text-gray-900 truncate">' + job.name + '</h3>' +
                            '<p class="text-xs sm:text-sm text-gray-500 truncate">' + (job.description || 'No description') + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<div class="flex flex-col items-end space-y-1">' +
                        '<span class="px-2 py-1 text-xs font-semibold rounded-full ' + activeClass + '">' +
                            (job.isActive ? 'Active' : 'Inactive') +
                        '</span>' +
                        '<span class="job-status px-2 py-1 text-xs font-semibold rounded-full ' + statusClass + '">' +
                            (job.status || 'PENDING') +
                        '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="space-y-2 mb-4">' +
                    '<div class="flex items-center justify-between">' +
                        '<span class="text-xs text-gray-500">Cron Expression</span>' +
                        '<code class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800">' + job.cronExpression + '</code>' +
                    '</div>' +
                    '<div class="flex items-center justify-between">' +
                        '<span class="text-xs text-gray-500">Method</span>' +
                        '<span class="text-xs font-medium text-gray-900">' + job.httpMethod + '</span>' +
                    '</div>' +
                    '<div class="flex items-start justify-between">' +
                        '<span class="text-xs text-gray-500">Endpoint</span>' +
                        '<span class="text-xs text-gray-900 font-mono truncate ml-2 max-w-xs text-right">' + job.endpointUrl + '</span>' +
                    '</div>' +
                    '<div class="flex items-center justify-between">' +
                        '<span class="text-xs text-gray-500">Last Run</span>' +
                        '<span class="text-xs text-gray-900">' + lastRun + '</span>' +
                    '</div>' +
                    '<div class="flex items-center justify-between">' +
                        '<span class="text-xs text-gray-500">Next Run</span>' +
                        '<span class="text-xs text-gray-900">' + nextRun + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="flex items-center justify-end pt-4 border-t border-gray-200">' +
                    '<div class="relative inline-block text-left">' +
                        '<button type="button" class="action-menu-btn p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" data-job-id="' + job.id + '" aria-label="Actions">' +
                            '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">' +
                                '<path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>' +
                            '</svg>' +
                        '</button>' +
                        '<div class="action-menu hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1" data-menu-id="' + job.id + '" style="z-index: 1000;">' +
                            '<button onclick="toggleJob(\'' + job.id + '\')" class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">' +
                                '<span class="flex items-center">' +
                                    '<svg class="w-4 h-4 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />' +
                                    '</svg>' +
                                    (job.isActive ? 'Disable' : 'Enable') +
                                '</span>' +
                            '</button>' +
                            '<button onclick="executeJob(\'' + job.id + '\')" class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">' +
                                '<span class="flex items-center">' +
                                    '<svg class="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />' +
                                    '</svg>' +
                                    'Execute' +
                                '</span>' +
                            '</button>' +
                            '<button onclick="deleteJob(\'' + job.id + '\')" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">' +
                                '<span class="flex items-center">' +
                                    '<svg class="w-4 h-4 mr-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />' +
                                    '</svg>' +
                                    'Delete' +
                                '</span>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }
}

function showError(message) {
    const tbody = document.getElementById('jobs-table');
    const cardsContainer = document.getElementById('jobs-cards');
    const errorHtml = '<div class="text-center py-12">' +
        '<p class="text-red-500 font-medium">' + message + '</p>' +
        '<button onclick="loadJobs()" class="mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium">Retry</button>' +
        '</div>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="7">' + errorHtml + '</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '<div class="bg-white rounded-xl shadow-md p-6 border border-gray-200">' + errorHtml + '</div>';
}

window.deleteJob = async function(id) {
    if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch('/cron/' + id, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            window.loadJobs();
        } else {
            const error = await response.json();
            alert(error.message || 'Failed to delete job');
        }
    } catch (error) {
        console.error('Failed to delete job:', error);
        alert('Failed to delete job. Please try again.');
    }
};

window.toggleJob = async function(id) {
    try {
        const response = await fetch('/cron/' + id + '/toggle', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            window.loadJobs();
        } else {
            const error = await response.json();
            alert(error.message || 'Failed to toggle job');
        }
    } catch (error) {
        console.error('Failed to toggle job:', error);
        alert('Failed to toggle job. Please try again.');
    }
};

window.executeJob = async function(id) {
    try {
        const response = await fetch('/cron/' + id + '/execute', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.ok) {
            window.loadJobs();
        } else {
            const error = await response.json();
            alert(error.message || 'Failed to execute job');
        }
    } catch (error) {
        console.error('Failed to execute job:', error);
        alert('Failed to execute job. Please try again.');
    }
};

// Cron expression helper functions
window.applyCronPreset = function(value) {
    const cronInput = document.getElementById('cronExpression');
    const nextRunDiv = document.getElementById('cronNextRun');
    const errorDiv = document.getElementById('cronError');
    
    if (!cronInput) return;
    
    if (value && value !== 'custom') {
        cronInput.value = value;
        window.validateCronExpression(value);
    } else if (value === 'custom') {
        cronInput.value = '';
        cronInput.focus();
        if (nextRunDiv) nextRunDiv.classList.add('hidden');
        if (errorDiv) errorDiv.classList.add('hidden');
    }
};

window.validateCronExpression = async function(expression) {
    const nextRunDiv = document.getElementById('cronNextRun');
    const nextRunText = document.getElementById('cronNextRunText');
    const errorDiv = document.getElementById('cronError');
    const errorText = document.getElementById('cronErrorText');
    
    if (!expression || !expression.trim()) {
        if (nextRunDiv) nextRunDiv.classList.add('hidden');
        if (errorDiv) errorDiv.classList.add('hidden');
        return;
    }
    
    const expr = expression.trim();
    
    // Basic format validation (must have 5 parts)
    const parts = expr.split(/\s+/);
    if (parts.length !== 5) {
        if (nextRunDiv) nextRunDiv.classList.add('hidden');
        if (errorDiv && errorText) {
            errorText.textContent = 'Cron expression must have exactly 5 fields (minute hour day month dayOfWeek)';
            errorDiv.classList.remove('hidden');
        }
        return false;
    }
    
    // Validate via API
    try {
        const response = await fetch('/cron/validate', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ cronExpression: expr }),
        });
        
        if (response.status === 401) {
            // Not logged in, but that's okay for validation
            return false;
        }
        
        const result = await response.json();
        
        if (result.valid) {
            if (errorDiv) errorDiv.classList.add('hidden');
            if (nextRunDiv && nextRunText) {
                const nextRunDate = new Date(result.nextRun);
                const now = new Date();
                const timeUntilNext = Math.round((nextRunDate - now) / 1000 / 60); // minutes
                
                let timeText = '';
                if (timeUntilNext < 1) {
                    timeText = 'in less than a minute';
                } else if (timeUntilNext < 60) {
                    timeText = `in ${timeUntilNext} minute${timeUntilNext !== 1 ? 's' : ''}`;
                } else {
                    const hours = Math.floor(timeUntilNext / 60);
                    const mins = timeUntilNext % 60;
                    timeText = `in ${hours}h ${mins}m`;
                }
                
                nextRunText.textContent = `✓ Valid expression • Next run: ${nextRunDate.toLocaleString()} (${timeText})`;
                nextRunDiv.classList.remove('hidden');
            }
            return true;
        } else {
            if (nextRunDiv) nextRunDiv.classList.add('hidden');
            if (errorDiv && errorText) {
                errorText.textContent = result.error || 'Invalid cron expression';
                errorDiv.classList.remove('hidden');
            }
            return false;
        }
    } catch (error) {
        console.error('Failed to validate cron expression:', error);
        // Fallback to basic validation
        if (nextRunDiv && nextRunText) {
            nextRunText.textContent = '✓ Expression format looks valid';
            nextRunDiv.classList.remove('hidden');
        }
        if (errorDiv) errorDiv.classList.add('hidden');
        return true; // Assume valid if API fails
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing jobs page');
    
    // Set up event listeners for buttons (alternative to inline onclick)
    const createJobBtn = document.querySelector('button[onclick="showCreateJobModal()"]');
    if (createJobBtn) {
        createJobBtn.removeAttribute('onclick');
        createJobBtn.addEventListener('click', window.showCreateJobModal);
    }
    
    // Set up form submission handler
    const createJobForm = document.getElementById('createJobForm');
    if (createJobForm) {
        createJobForm.addEventListener('submit', (e) => {
            e.preventDefault();
            window.createJob(e);
        });
        // Remove inline onsubmit if present
        createJobForm.removeAttribute('onsubmit');
    }
    
    // Set up cron expression validation on input
    const cronInput = document.getElementById('cronExpression');
    const cronPreset = document.getElementById('cronPreset');
    
    if (cronPreset) {
        cronPreset.addEventListener('change', function() {
            const value = this.value;
            if (value && value !== 'custom' && cronInput) {
                cronInput.value = value;
                window.validateCronExpression(value);
            } else if (value === 'custom' && cronInput) {
                cronInput.value = '';
                cronInput.focus();
                const nextRunDiv = document.getElementById('cronNextRun');
                const errorDiv = document.getElementById('cronError');
                if (nextRunDiv) nextRunDiv.classList.add('hidden');
                if (errorDiv) errorDiv.classList.add('hidden');
            }
        });
    }
    
    if (cronInput) {
        // Debounce validation to avoid too many API calls
        let validationTimeout;
        cronInput.addEventListener('input', function() {
            if (cronPreset && cronPreset.value !== 'custom') {
                cronPreset.value = 'custom';
            }
            
            // Clear previous timeout
            if (validationTimeout) {
                clearTimeout(validationTimeout);
            }
            
            // Validate after user stops typing for 500ms
            validationTimeout = setTimeout(() => {
                window.validateCronExpression(this.value);
            }, 500);
        });
        
        cronInput.addEventListener('blur', function() {
            if (validationTimeout) {
                clearTimeout(validationTimeout);
            }
            window.validateCronExpression(this.value);
        });
    }
    
    // Set up cron help tooltip
    const cronHelpBtn = document.getElementById('cronHelpBtn');
    const cronHelpTooltip = document.getElementById('cronHelpTooltip');
    const closeCronHelp = document.getElementById('closeCronHelp');
    
    if (cronHelpBtn && cronHelpTooltip) {
        // Toggle tooltip on button click
        cronHelpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            cronHelpTooltip.classList.toggle('hidden');
        });
        
        // Close tooltip on close button click
        if (closeCronHelp) {
            closeCronHelp.addEventListener('click', (e) => {
                e.stopPropagation();
                cronHelpTooltip.classList.add('hidden');
            });
        }
        
        // Close tooltip when clicking outside (but not on the button)
        document.addEventListener('click', (e) => {
            if (cronHelpTooltip && !cronHelpTooltip.classList.contains('hidden')) {
                if (!cronHelpTooltip.contains(e.target) && !cronHelpBtn.contains(e.target)) {
                    cronHelpTooltip.classList.add('hidden');
                }
            }
        });
        
        // Close tooltip on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && cronHelpTooltip && !cronHelpTooltip.classList.contains('hidden')) {
                cronHelpTooltip.classList.add('hidden');
            }
        });
    }
    
    // Find all buttons with onclick handlers and convert them to event listeners
    document.querySelectorAll('[onclick]').forEach(el => {
        const onclickAttr = el.getAttribute('onclick');
        if (onclickAttr) {
            const match = onclickAttr.match(/^(\w+)\((.*?)\)$/);
            if (match) {
                const funcName = match[1];
                const argsStr = match[2] || '';
                const args = argsStr ? argsStr.split(',').map(a => a.trim().replace(/['"]/g, '')) : [];
                el.removeAttribute('onclick');
                
                if (funcName === 'showCreateJobModal') {
                    el.addEventListener('click', window.showCreateJobModal);
                } else if (funcName === 'closeCreateJobModal') {
                    el.addEventListener('click', window.closeCreateJobModal);
                } else if (funcName === 'toggleJob' && args[0]) {
                    el.addEventListener('click', () => window.toggleJob(args[0]));
                } else if (funcName === 'executeJob' && args[0]) {
                    el.addEventListener('click', () => window.executeJob(args[0]));
                } else if (funcName === 'deleteJob' && args[0]) {
                    el.addEventListener('click', () => window.deleteJob(args[0]));
                } else if (funcName === 'loadJobs') {
                    el.addEventListener('click', window.loadJobs);
                }
            }
        }
    });
    
    window.loadJobs();
});
