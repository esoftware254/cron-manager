// Audit page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    loadAuditLogs();
});

async function loadAuditLogs() {
    try {
        const response = await fetch('/api/audit?take=100', {
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
            throw new Error('Failed to fetch audit logs');
        }

        const logs = await response.json();

        const tbody = document.getElementById('audit-table');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No audit logs found</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const statusClass = log.responseStatus >= 200 && log.responseStatus < 300 ? 
                               'bg-green-100 text-green-800' : 
                               'bg-red-100 text-red-800';
            const resourceIdHtml = log.resourceId ? 
                '<span class="text-gray-400">(' + log.resourceId.substring(0, 8) + '...)</span>' : 
                '';

            return '<tr>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">' + log.action + '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">' + (log.user?.email || log.token?.name || 'System') + '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">' +
                    (log.resourceType || '-') +
                    ' ' + resourceIdHtml +
                '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">' + new Date(log.timestamp).toLocaleString() + '</td>' +
                '<td class="px-6 py-4 whitespace-nowrap">' +
                    '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ' + statusClass + '">' +
                        (log.responseStatus || '-') +
                    '</span>' +
                '</td>' +
            '</tr>';
        }).join('');
    } catch (error) {
        console.error('Failed to load audit logs:', error);
        const tbody = document.getElementById('audit-table');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to load audit logs</td></tr>';
        }
    }
}

