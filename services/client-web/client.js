// Configuração
const API_BASE_URL = window.location.origin;

// Armazenamento local do token
let currentToken = localStorage.getItem('chat4all_token');
let currentRefreshToken = localStorage.getItem('chat4all_refresh_token');

// Atualizar exibição do token
function updateTokenDisplay() {
    const tokenDisplay = document.getElementById('token-display');
    const currentTokenEl = document.getElementById('current-token');
    
    if (currentToken) {
        tokenDisplay.style.display = 'block';
        currentTokenEl.textContent = currentToken.substring(0, 30) + '...';
    } else {
        tokenDisplay.style.display = 'none';
    }
}

// Limpar token
function clearToken() {
    currentToken = null;
    currentRefreshToken = null;
    localStorage.removeItem('chat4all_token');
    localStorage.removeItem('chat4all_refresh_token');
    updateTokenDisplay();
    addResult('info', 'Token limpo');
}

// Mapear códigos de erro gRPC para mensagens legíveis
function getGrpcErrorDescription(code) {
    const errorMap = {
        3: 'INVALID_ARGUMENT - Argumento inválido',
        6: 'ALREADY_EXISTS - Recurso já existe',
        13: 'INTERNAL - Erro interno do servidor',
        14: 'UNAVAILABLE - Serviço indisponível',
        16: 'UNAUTHENTICATED - Credenciais inválidas',
    };
    return errorMap[code] || `Código de erro: ${code}`;
}

// Adicionar resultado à área de resultados
function addResult(type, title, data = null, error = null) {
    const resultsContainer = document.getElementById('results');
    const resultDiv = document.createElement('div');
    resultDiv.className = `result result-${type}`;
    
    const timestamp = new Date().toLocaleString('pt-BR');
    const timeEl = document.createElement('div');
    timeEl.className = 'result-time';
    timeEl.textContent = timestamp;
    
    const titleEl = document.createElement('div');
    titleEl.className = 'result-title';
    titleEl.textContent = title;
    
    resultDiv.appendChild(timeEl);
    resultDiv.appendChild(titleEl);
    
    if (error) {
        const errorEl = document.createElement('div');
        errorEl.className = 'result-error';
        
        let errorMessage = error.message || error;
        if (typeof error === 'object' && error.error) {
            errorMessage = error.error;
        }
        
        errorEl.textContent = `Erro: ${errorMessage}`;
        
        // Adicionar código de erro gRPC se disponível
        const errorCode = error.code || (typeof error === 'object' && error.code);
        if (errorCode) {
            const codeDesc = getGrpcErrorDescription(errorCode);
            const codeEl = document.createElement('div');
            codeEl.className = 'result-error-code';
            codeEl.style.fontSize = '0.9em';
            codeEl.style.color = '#666';
            codeEl.style.marginTop = '4px';
            codeEl.textContent = codeDesc;
            errorEl.appendChild(codeEl);
        }
        
        resultDiv.appendChild(errorEl);
    }
    
    if (data) {
        const dataEl = document.createElement('pre');
        dataEl.className = 'result-data';
        dataEl.textContent = JSON.stringify(data, null, 2);
        resultDiv.appendChild(dataEl);
    }
    
    resultsContainer.insertBefore(resultDiv, resultsContainer.firstChild);
    
    // Limitar a 50 resultados
    while (resultsContainer.children.length > 50) {
        resultsContainer.removeChild(resultsContainer.lastChild);
    }
}

// Limpar resultados
function clearResults() {
    document.getElementById('results').innerHTML = '';
}

// Exportar resultados
function exportResults() {
    const results = Array.from(document.querySelectorAll('.result')).map(el => ({
        time: el.querySelector('.result-time').textContent,
        title: el.querySelector('.result-title').textContent,
        error: el.querySelector('.result-error')?.textContent || null,
        data: el.querySelector('.result-data')?.textContent || null,
    }));
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat4all-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Função genérica para fazer requisições
async function apiRequest(endpoint, method = 'GET', body = null, useToken = false) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        if (useToken && currentToken) {
            if (method === 'GET') {
                endpoint += (endpoint.includes('?') ? '&' : '?') + `token=${encodeURIComponent(currentToken)}`;
            } else {
                body = body || {};
                body.token = currentToken;
                options.body = JSON.stringify(body);
            }
        }
        
        console.log(`[apiRequest] ${method} ${API_BASE_URL}${endpoint}`, { body: body ? JSON.parse(options.body) : null });
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Resposta não é JSON: ${text.substring(0, 100)}`);
        }
        
        if (!response.ok) {
            // Extrair informações de erro do response
            const errorInfo = {
                message: data.error || `HTTP ${response.status}`,
                code: data.code || response.status,
            };
            throw errorInfo;
        }
        
        return data;
    } catch (error) {
        console.error(`[apiRequest] Erro em ${method} ${endpoint}:`, error);
        // Se já é um objeto de erro com code, propagar diretamente
        if (typeof error === 'object' && error.code !== undefined) {
            throw error;
        }
        // Caso contrário, criar objeto de erro padrão
        throw {
            message: error.message || String(error),
            code: undefined,
        };
    }
}

// ===========================
// Handlers de Autenticação
// ===========================

document.getElementById('register-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const displayName = document.getElementById('register-display-name').value;
    
    try {
        const body = {
            username,
            password,
        };
        
        if (email) body.email = email;
        if (displayName) body.display_name = displayName;
        
        const response = await apiRequest('/api/auth/register', 'POST', body);
        addResult('success', 'Usuário registrado com sucesso', response);
        
        // Limpar formulário
        document.getElementById('register-user-form').reset();
    } catch (error) {
        addResult('error', 'Erro ao registrar usuário', null, error);
    }
});

document.getElementById('get-token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await apiRequest('/api/auth/token', 'POST', {
            username,
            password,
            grant_type: 'password',
        });
        
        currentToken = response.access_token;
        currentRefreshToken = response.refresh_token;
        
        localStorage.setItem('chat4all_token', currentToken);
        if (currentRefreshToken) {
            localStorage.setItem('chat4all_refresh_token', currentRefreshToken);
        }
        
        updateTokenDisplay();
        addResult('success', 'Login realizado com sucesso', response);
        
        // Limpar formulário
        document.getElementById('get-token-form').reset();
    } catch (error) {
        addResult('error', 'Erro ao fazer login', null, error);
    }
});

document.getElementById('validate-token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = document.getElementById('validate-token-input').value || currentToken;
    
    if (!token) {
        addResult('error', 'Erro ao validar token', null, { message: 'Token não fornecido' });
        return;
    }
    
    try {
        const response = await apiRequest('/api/auth/validate', 'POST', { token });
        addResult('success', 'Token validado', response);
    } catch (error) {
        addResult('error', 'Erro ao validar token', null, error);
    }
});

document.getElementById('refresh-token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const refreshToken = document.getElementById('refresh-token-input').value || currentRefreshToken;
    
    if (!refreshToken) {
        addResult('error', 'Erro ao renovar token', null, { message: 'Refresh token não fornecido' });
        return;
    }
    
    try {
        const response = await apiRequest('/api/auth/refresh', 'POST', { refresh_token: refreshToken });
        
        currentToken = response.access_token;
        localStorage.setItem('chat4all_token', currentToken);
        
        updateTokenDisplay();
        addResult('success', 'Token renovado com sucesso', response);
    } catch (error) {
        addResult('error', 'Erro ao renovar token', null, error);
    }
});

document.getElementById('revoke-token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = document.getElementById('revoke-token-input').value || currentToken;
    
    if (!token) {
        addResult('error', 'Erro ao revogar token', null, { message: 'Token não fornecido' });
        return;
    }
    
    try {
        const response = await apiRequest('/api/auth/revoke', 'POST', { token });
        addResult('success', 'Token revogado com sucesso', response);
        
        if (token === currentToken) {
            clearToken();
        }
    } catch (error) {
        addResult('error', 'Erro ao revogar token', null, error);
    }
});

// ===========================
// Handlers de Conversas
// ===========================

document.getElementById('create-conversation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = document.getElementById('conversation-type').value;
    const membersStr = document.getElementById('conversation-members').value;
    const name = document.getElementById('conversation-name').value;
    
    const memberIds = membersStr.split(',').map(id => id.trim()).filter(id => id);
    
    try {
        const body = {
            type,
            member_ids: memberIds,
        };
        
        if (name) body.name = name;
        
        const response = await apiRequest('/api/conversations/create', 'POST', body, true);
        addResult('success', 'Conversa criada com sucesso', response);
    } catch (error) {
        addResult('error', 'Erro ao criar conversa', null, error);
    }
});

document.getElementById('list-conversations-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const includeArchived = document.getElementById('include-archived').checked;
    
    try {
        // O userId será extraído automaticamente do token
        const endpoint = `/api/conversations?include_archived=${includeArchived}`;
        const response = await apiRequest(endpoint, 'GET', null, true);
        addResult('success', `Conversas encontradas: ${response.total_count}`, response);
    } catch (error) {
        addResult('error', 'Erro ao listar conversas', null, error);
    }
});

document.getElementById('get-conversation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const conversationId = document.getElementById('get-conversation-id').value;
    
    try {
        const response = await apiRequest(`/api/conversations/${conversationId}`, 'GET', null, true);
        addResult('success', 'Conversa obtida com sucesso', response);
    } catch (error) {
        addResult('error', 'Erro ao obter conversa', null, error);
    }
});

document.getElementById('add-members-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const conversationId = document.getElementById('add-members-conv-id').value;
    const userIdsStr = document.getElementById('add-members-user-ids').value;
    
    const userIds = userIdsStr.split(',').map(id => id.trim()).filter(id => id);
    
    try {
        const response = await apiRequest(`/api/conversations/${conversationId}/members`, 'POST', {
            user_ids: userIds,
        }, true);
        addResult('success', 'Membros adicionados com sucesso', response);
    } catch (error) {
        addResult('error', 'Erro ao adicionar membros', null, error);
    }
});

// ===========================
// Handlers de Mensagens
// ===========================

document.getElementById('send-message-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const conversationId = document.getElementById('message-conversation-id').value;
    const channelsStr = document.getElementById('message-channels').value;
    const text = document.getElementById('message-text').value;
    
    const channels = channelsStr ? channelsStr.split(',').map(c => c.trim()).filter(c => c) : ['all'];
    
    try {
        // O tipo será convertido no server.js para o formato do enum do protobuf
        // Pode enviar 'TEXT' ou 'MESSAGE_TYPE_TEXT', ambos funcionarão
        // O userId será extraído automaticamente do token
        const response = await apiRequest('/api/messages/send', 'POST', {
            conversation_id: conversationId,
            channels,
            payload: {
                type: 'TEXT', // Será convertido para MESSAGE_TYPE_TEXT no server.js
                text,
            },
        }, true);
        addResult('success', 'Mensagem enviada com sucesso', response);
    } catch (error) {
        addResult('error', 'Erro ao enviar mensagem', null, error);
    }
});

document.getElementById('get-messages-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const conversationId = document.getElementById('get-messages-conv-id').value;
    const limit = document.getElementById('get-messages-limit').value;
    const sinceSeq = document.getElementById('get-messages-since-seq').value;
    const untilSeq = document.getElementById('get-messages-until-seq').value;
    const reverse = document.getElementById('get-messages-reverse').checked;
    
    let endpoint = `/api/messages?conversation_id=${encodeURIComponent(conversationId)}`;
    if (limit) endpoint += `&limit=${encodeURIComponent(limit)}`;
    if (sinceSeq) endpoint += `&since_seq=${encodeURIComponent(sinceSeq)}`;
    if (untilSeq) endpoint += `&until_seq=${encodeURIComponent(untilSeq)}`;
    if (reverse) endpoint += `&reverse=true`;
    
    try {
        const response = await apiRequest(endpoint, 'GET', null, true);
        
        // Formatar mensagens para exibição mais legível
        const messagesCount = response.messages?.length || 0;
        const hasMore = response.has_more || false;
        const nextSeq = response.next_seq;
        
        let title = `Mensagens obtidas: ${messagesCount}`;
        if (hasMore) {
            title += ` (há mais mensagens disponíveis)`;
        }
        if (nextSeq !== undefined) {
            title += ` | Próximo seq: ${nextSeq}`;
        }
        
        // Criar uma versão formatada das mensagens para exibição
        const formattedData = {
            total_messages: messagesCount,
            has_more: hasMore,
            next_seq: nextSeq,
            messages: response.messages?.map((msg, index) => {
                const payload = msg.payload || {};
                let content = '';
                
                // Formatar conteúdo baseado no tipo
                switch (payload.type) {
                    case 'MESSAGE_TYPE_TEXT':
                        content = payload.text || '';
                        break;
                    case 'MESSAGE_TYPE_IMAGE':
                    case 'MESSAGE_TYPE_VIDEO':
                    case 'MESSAGE_TYPE_AUDIO':
                    case 'MESSAGE_TYPE_DOCUMENT':
                        content = payload.file 
                            ? `📎 ${payload.type.replace('MESSAGE_TYPE_', '')}: ${payload.file.name || 'sem nome'} (${payload.file.mime_type || 'tipo desconhecido'})`
                            : 'Arquivo sem informações';
                        break;
                    case 'MESSAGE_TYPE_LOCATION':
                        content = payload.location
                            ? `📍 Localização: ${payload.location.latitude}, ${payload.location.longitude}${payload.location.address ? ` (${payload.location.address})` : ''}`
                            : 'Localização sem informações';
                        break;
                    case 'MESSAGE_TYPE_CONTACT':
                        content = payload.contact
                            ? `👤 Contato: ${payload.contact.name}${payload.contact.phone ? ` (${payload.contact.phone})` : ''}${payload.contact.email ? ` - ${payload.contact.email}` : ''}`
                            : 'Contato sem informações';
                        break;
                    default:
                        content = JSON.stringify(payload);
                }
                
                return {
                    index: index + 1,
                    message_id: msg.message_id,
                    seq: msg.seq,
                    from: msg.from,
                    to: msg.to || [],
                    type: payload.type || 'UNKNOWN',
                    content: content,
                    status: msg.status,
                    created_at: msg.created_at ? new Date(parseInt(msg.created_at) * 1000).toLocaleString('pt-BR') : 'N/A',
                    metadata: msg.metadata || {},
                };
            }) || [],
            raw_response: response,
        };
        
        addResult('success', title, formattedData);
    } catch (error) {
        addResult('error', 'Erro ao obter mensagens', null, error);
    }
});

// Inicializar
updateTokenDisplay();

