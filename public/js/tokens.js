// Tokens page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    loadTokens();
    setupCreateTokenForm();
});

async function loadTokens() {
    try {
        const response = await fetch('/auth/tokens', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });
        
        // Check if response is HTML (redirect) instead of JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
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
            throw new Error('Failed to fetch tokens');
        }

        const tokens = await response.json();
        renderTokens(tokens);
    } catch (error) {
        console.error('Failed to load tokens:', error);
        const tbody = document.getElementById('tokens-table');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Failed to load tokens. Please refresh the page.</td></tr>';
        }
    }
}

function renderTokens(tokens) {
    const tbody = document.getElementById('tokens-table');
    if (!tbody) return;

    if (!tokens || tokens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No tokens found. Create your first token to get started.</td></tr>';
        return;
    }

    tbody.innerHTML = tokens.map(token => {
        const statusClass = token.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
        const statusText = token.isActive ? 'Active' : 'Inactive';
        const permissions = Array.isArray(token.permissions) ? token.permissions.join(', ') : (token.permissions || 'None');
        const lastUsed = token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'Never';
        // Always mask tokens in the list view for security (even though API returns full token)
        const maskedToken = token.token && token.token.length > 8
            ? token.token.substring(0, 4) + '••••••••' + token.token.substring(token.token.length - 4)
            : (token.token ? '••••••••' : 'N/A');

        return '<tr class="hover:bg-gray-50 transition-colors">' +
            '<td class="px-4 sm:px-6 py-4 text-sm font-medium text-gray-900">' + (token.name || 'Unnamed Token') + '</td>' +
            '<td class="px-4 sm:px-6 py-4">' +
                '<code class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 font-mono" title="Token value is masked for security">' + maskedToken + '</code>' +
            '</td>' +
            '<td class="px-4 sm:px-6 py-4 text-sm text-gray-600">' +
                '<div class="flex flex-wrap gap-1">' +
                    permissions.split(', ').filter(p => p).map(p => '<span class="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">' + p + '</span>').join('') +
                '</div>' +
            '</td>' +
            '<td class="px-4 sm:px-6 py-4 whitespace-nowrap">' +
                '<span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ' + statusClass + '">' + statusText + '</span>' +
            '</td>' +
            '<td class="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-600">' + lastUsed + '</td>' +
            '<td class="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">' +
                '<button onclick="revokeToken(\'' + token.id + '\')" class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors" title="Revoke token">' +
                    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />' +
                    '</svg>' +
                '</button>' +
            '</td>' +
        '</tr>';
    }).join('');
}

function setupCreateTokenForm() {
    const form = document.getElementById('createTokenForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await createToken(e);
    });
}

async function createToken(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const name = formData.get('name');
    const permissions = formData.getAll('permissions');

    if (!name || !name.trim()) {
        alert('Please enter a token name');
        return;
    }

    if (!permissions || permissions.length === 0) {
        alert('Please select at least one permission');
        return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : 'Create';
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
    }

    try {
        const response = await fetch('/auth/tokens', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                name: name.trim(),
                permissions: permissions,
            }),
        });

        // Check if response is HTML (redirect) instead of JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
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
            const error = await response.json();
            alert(error.message || 'Failed to create token');
            return;
        }

        const token = await response.json();
        
        // Show token in a modal
        const tokenModal = document.getElementById('tokenCreatedModal');
        const tokenValueEl = document.getElementById('tokenValue');
        if (tokenModal && tokenValueEl) {
            tokenValueEl.textContent = token.token || '';
            tokenModal.classList.remove('hidden');
            // Close create modal
            closeCreateTokenModal();
        } else {
            // Fallback: show alert with token
            alert('Token created successfully!\n\nToken: ' + (token.token || '') + '\n\nPlease copy this token now. You will not be able to see it again.');
            closeCreateTokenModal();
        }
        
        // Reload tokens list
        loadTokens();
        
        // Reset form
        form.reset();
    } catch (error) {
        console.error('Failed to create token:', error);
        alert('Failed to create token. Please try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

function copyToken(token) {
    navigator.clipboard.writeText(token).then(() => {
        // Show feedback
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        toast.textContent = 'Token copied to clipboard!';
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy token:', err);
        alert('Failed to copy token to clipboard');
    });
}

async function revokeToken(id) {
    if (!confirm('Are you sure you want to revoke this token? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch('/auth/tokens/' + id, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        // Check if response is HTML (redirect) instead of JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
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
            const error = await response.json();
            alert(error.message || 'Failed to revoke token');
            return;
        }

        // Reload tokens list
        loadTokens();
    } catch (error) {
        console.error('Failed to revoke token:', error);
        alert('Failed to revoke token. Please try again.');
    }
}

// Make functions available globally
window.showCreateTokenModal = function() {
    const modal = document.getElementById('createTokenModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
};

window.closeCreateTokenModal = function() {
    const modal = document.getElementById('createTokenModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    const form = document.getElementById('createTokenForm');
    if (form) {
        form.reset();
    }
};

window.createToken = createToken;
window.copyToken = copyToken;
window.revokeToken = revokeToken;
