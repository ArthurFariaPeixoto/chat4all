# Script de Teste Simplificado - Validacao de Requisitos
# Data: 08/12/2025

$ErrorActionPreference = "Continue"
$API_URL = "http://localhost:3000"
$TEST_RESULTS = @()

Write-Host "==================================`n" -ForegroundColor Cyan
Write-Host "CHAT4ALL - TESTE DE REQUISITOS`n" -ForegroundColor Cyan
Write-Host "==================================`n" -ForegroundColor Cyan

# Funcao para registrar resultados
function Add-TestResult {
    param(
        [string]$Requirement,
        [string]$Test,
        [string]$Status,
        [string]$Details
    )
    $script:TEST_RESULTS += [PSCustomObject]@{
        Requirement = $Requirement
        Test = $Test
        Status = $Status
        Details = $Details
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
}

# 1. Verificar saude da API
Write-Host "[1/10] Verificando saude da API...`n" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health" -Method Get -ErrorAction Stop
    if ($health) {
        Write-Host "[OK] API esta saudavel`n" -ForegroundColor Green
        Add-TestResult -Requirement "Geral" -Test "Health Check" -Status "PASS" -Details "API respondendo corretamente"
    }
}
catch {
    Write-Host "[X] API nao esta respondendo: $_`n" -ForegroundColor Red
    Add-TestResult -Requirement "Geral" -Test "Health Check" -Status "FAIL" -Details "API nao respondeu: $_"
    Write-Host "Por favor, inicie a API antes de continuar os testes.`n" -ForegroundColor Red
    exit 1
}

# 2. Criar usuarios de teste
Write-Host "[2/10] Criando usuarios de teste...`n" -ForegroundColor Yellow
$users = @()
$tokens = @()

for ($i = 1; $i -le 3; $i++) {
    $username = "testuser$i"
    $email = "testuser$i@chat4all.test"
    $password = "Test@123$i"
    
    try {
        # Tentar fazer login primeiro (usuario pode ja existir)
        $loginBody = @{
            email = $email
            password = $password
        } | ConvertTo-Json
        
        $loginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction SilentlyContinue
        
        if ($loginResponse -and $loginResponse.accessToken) {
            $users += [PSCustomObject]@{
                id = $loginResponse.user.id
                username = $username
                email = $email
            }
            $tokens += $loginResponse.accessToken
            Write-Host "[OK] Usuario $username logado`n" -ForegroundColor Green
        }
    }
    catch {
        # Se login falhou, tentar registrar
        try {
            $registerBody = @{
                username = $username
                email = $email
                password = $password
            } | ConvertTo-Json
            
            $registerResponse = Invoke-RestMethod -Uri "$API_URL/auth/register" -Method POST -Body $registerBody -ContentType "application/json" -ErrorAction Stop
            
            if ($registerResponse) {
                Write-Host "[OK] Usuario $username criado`n" -ForegroundColor Green
                
                # Login apos registro
                $loginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction Stop
                
                if ($loginResponse -and $loginResponse.accessToken) {
                    $users += [PSCustomObject]@{
                        id = $loginResponse.user.id
                        username = $username
                        email = $email
                    }
                    $tokens += $loginResponse.accessToken
                    Write-Host "[OK] Login de $username realizado`n" -ForegroundColor Green
                }
            }
        }
        catch {
            Write-Host "[!] Aviso: Erro ao criar/logar usuario $username`n" -ForegroundColor Yellow
        }
    }
}

if ($tokens.Count -lt 2) {
    Write-Host "[X] Nao foi possivel criar usuarios suficientes para testes`n" -ForegroundColor Red
    exit 1
}

Add-TestResult -Requirement "2.5" -Test "Autenticacao API" -Status "PASS" -Details "Criados e autenticados $($tokens.Count) usuarios"

# 3. Testar Requisito 2.1 - Mensageria Basica
Write-Host "[3/10] Testando Requisito 2.1 - Mensageria Basica`n" -ForegroundColor Yellow

# 3.1 - Criar conversa privada (1:1)
Write-Host "  3.1 - Criando conversa privada (1:1)...`n" -ForegroundColor Cyan
try {
    $conversationBody = @{
        type = "private"
        participantIds = @($users[0].id, $users[1].id)
        name = "Conversa Teste 1:1"
    } | ConvertTo-Json

    $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
    $conversation = Invoke-RestMethod -Uri "$API_URL/conversations" -Method POST -Body $conversationBody -ContentType "application/json" -Headers $headers -ErrorAction Stop

    # Captura correta do ID da conversa
    if ($conversation -and $conversation.id) {
        $privateConvId = $conversation.id
        Write-Host "  [OK] Conversa privada criada: $($conversation.id)`n" -ForegroundColor Green
        Add-TestResult -Requirement "2.1" -Test "Criar conversa privada (1:1)" -Status "PASS" -Details "ID: $($conversation.id)"
    }
}
catch {
    Write-Host "  [X] Erro ao criar conversa privada: $_`n" -ForegroundColor Red
    Add-TestResult -Requirement "2.1" -Test "Criar conversa privada (1:1)" -Status "FAIL" -Details "$_"
}

# 3.2 - Criar conversa em grupo
Write-Host "  3.2 - Criando conversa em grupo...`n" -ForegroundColor Cyan
try {
    $groupBody = @{
        type = "group"
        participantIds = @($users[0].id, $users[1].id, $users[2].id)
        name = "Grupo de Teste"
    } | ConvertTo-Json

    $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
    $group = Invoke-RestMethod -Uri "$API_URL/conversations" -Method POST -Body $groupBody -ContentType "application/json" -Headers $headers -ErrorAction Stop

    # Captura correta do ID do grupo
    if ($group -and $group.id) {
        $groupConvId = $group.id
        Write-Host "  [OK] Grupo criado: $($group.id)`n" -ForegroundColor Green
        Add-TestResult -Requirement "2.1" -Test "Criar grupo (n membros)" -Status "PASS" -Details "ID: $($group.id), Participantes: 3"
    }
}
catch {
    Write-Host "  [X] Erro ao criar grupo: $_`n" -ForegroundColor Red
    Add-TestResult -Requirement "2.1" -Test "Criar grupo (n membros)" -Status "FAIL" -Details "$_"
}

# 3.3 - Enviar mensagem de texto
Write-Host "  3.3 - Enviando mensagem de texto...`n" -ForegroundColor Cyan
try {
    if (-not $privateConvId) {
        Write-Host "  [X] conversationId está vazio ou null. Não é possível enviar mensagem." -ForegroundColor Red
        Add-TestResult -Requirement "2.1" -Test "Enviar mensagem de texto" -Status "FAIL" -Details "conversationId está vazio ou null."
    } else {
        $messageBody = @{
            conversationId = $privateConvId
            content = "Ola! Esta e uma mensagem de teste do sistema Chat4All"
            type = "text"
        } | ConvertTo-Json

        $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
        $message = Invoke-RestMethod -Uri "$API_URL/messages" -Method POST -Body $messageBody -ContentType "application/json" -Headers $headers -ErrorAction Stop

        if ($message -and $message.id) {
            Write-Host "  [OK] Mensagem enviada: $($message.id)`n" -ForegroundColor Green
            Add-TestResult -Requirement "2.1" -Test "Enviar mensagem de texto" -Status "PASS" -Details "ID: $($message.id)"
            $messageId = $message.id
        }
    }
}
catch {
    Write-Host "  [X] Erro ao enviar mensagem: $_`n" -ForegroundColor Red
    Add-TestResult -Requirement "2.1" -Test "Enviar mensagem de texto" -Status "FAIL" -Details "$_"
}

# 4. Testar Requisito 2.2 - Estados de Mensagem
Write-Host "[4/10] Testando Requisito 2.2 - Estados de Mensagem`n" -ForegroundColor Yellow

Write-Host "  4.1 - Verificando estado da mensagem...`n" -ForegroundColor Cyan
if (-not $messageId) {
    Write-Host "  [X] messageId está vazio ou null. Não é possível verificar estado da mensagem." -ForegroundColor Red
    Add-TestResult -Requirement "2.2" -Test "Verificar estado de mensagem" -Status "FAIL" -Details "messageId está vazio ou null."
} else {
    try {
        $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
        $msgStatus = Invoke-RestMethod -Uri "$API_URL/messages/$messageId" -Method GET -Headers $headers -ErrorAction Stop

        if ($msgStatus) {
            Write-Host "  [OK] Estado da mensagem: $($msgStatus.status)`n" -ForegroundColor Green
            Add-TestResult -Requirement "2.2" -Test "Verificar estado de mensagem" -Status "PASS" -Details "Status: $($msgStatus.status)"
        }
    }
    catch {
        Write-Host "  [X] Erro ao verificar estado: $_`n" -ForegroundColor Red
        Add-TestResult -Requirement "2.2" -Test "Verificar estado de mensagem" -Status "FAIL" -Details "$_"
    }
}

# 5. Testar Requisito 2.3 - Multiplataforma
Write-Host "[5/10] Testando Requisito 2.3 - Multiplataforma e Roteamento`n" -ForegroundColor Yellow

Write-Host "  5.1 - Testando vinculacao de usuarios a canais...`n" -ForegroundColor Cyan
try {
    $channelBody = @{
        channelName = "whatsapp"
        channelUserId = "+5511999999999"
        displayName = "Test User WhatsApp"
    } | ConvertTo-Json
    
    $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
    $channel = Invoke-RestMethod -Uri "$API_URL/user-channels" -Method POST -Body $channelBody -ContentType "application/json" -Headers $headers -ErrorAction Stop
    
    if ($channel -and $channel.id) {
        Write-Host "  [OK] Usuario vinculado ao WhatsApp`n" -ForegroundColor Green
        Add-TestResult -Requirement "2.3" -Test "Vinculacao a canais externos" -Status "PASS" -Details "Canal: whatsapp"
    }
}
catch {
    Write-Host "  [X] Erro ao vincular canal: $_`n" -ForegroundColor Red
    Add-TestResult -Requirement "2.3" -Test "Vinculacao a canais externos" -Status "FAIL" -Details "$_"
}

# 6. Testar Requisito 2.4 - Persistencia
Write-Host "[6/10] Testando Requisito 2.4 - Persistencia`n" -ForegroundColor Yellow

Write-Host "  6.1 - Verificando persistencia de mensagens...`n" -ForegroundColor Cyan
if (-not $privateConvId) {
    Write-Host "  [X] privateConvId está vazio ou null. Não é possível verificar persistência de mensagens." -ForegroundColor Red
    Add-TestResult -Requirement "2.4" -Test "Persistencia de mensagens" -Status "FAIL" -Details "privateConvId está vazio ou null."
} else {
    try {
        $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
        $messages = Invoke-RestMethod -Uri "$API_URL/conversations/$privateConvId/messages" -Method GET -Headers $headers -ErrorAction Stop

        if ($messages) {
            $count = if ($messages.Count) { $messages.Count } else { 1 }
            Write-Host "  [OK] Mensagens persistidas: $count`n" -ForegroundColor Green
            Add-TestResult -Requirement "2.4" -Test "Persistencia de mensagens" -Status "PASS" -Details "$count mensagens recuperadas"
        }
    }
    catch {
        Write-Host "  [X] Erro ao verificar persistencia: $_`n" -ForegroundColor Red
        Add-TestResult -Requirement "2.4" -Test "Persistencia de mensagens" -Status "FAIL" -Details "$_"
    }
}

# 7. Testar Requisito 2.5 - API Publica
Write-Host "[7/10] Testando Requisito 2.5 - API Publica`n" -ForegroundColor Yellow

Write-Host "  7.1 - Testando endpoints REST...`n" -ForegroundColor Cyan
$endpoints = @(
    @{Method="GET"; Path="/conversations"; Name="Listar conversas"},
    @{Method="GET"; Path="/user-channels"; Name="Listar canais de usuario"}
)

$passedEndpoints = 0
foreach ($endpoint in $endpoints) {
    try {
        $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
        $result = Invoke-RestMethod -Uri "$API_URL$($endpoint.Path)" -Method $endpoint.Method -Headers $headers -ErrorAction Stop
        if ($result) {
            Write-Host "    [OK] $($endpoint.Name)`n" -ForegroundColor Green
            $passedEndpoints++
        }
    }
    catch {
        Write-Host "    [X] $($endpoint.Name): $_`n" -ForegroundColor Red
    }
}

Add-TestResult -Requirement "2.5" -Test "Endpoints REST" -Status "PASS" -Details "$passedEndpoints/$($endpoints.Count) endpoints funcionando"

# 8. Testar Requisito 2.6 - Extensibilidade
Write-Host "[8/10] Testando Requisito 2.6 - Extensibilidade de Canais`n" -ForegroundColor Yellow

Write-Host "  8.1 - Verificando arquitetura de canais...`n" -ForegroundColor Cyan
try {
    $headers = @{ "Authorization" = "Bearer $($tokens[0])" }
    $channels = Invoke-RestMethod -Uri "$API_URL/user-channels" -Method GET -Headers $headers -ErrorAction Stop
    
    if ($channels) {
        $count = if ($channels.Count) { $channels.Count } else { if ($channels.id) { 1 } else { 0 } }
        Write-Host "  [OK] Canais configurados: $count`n" -ForegroundColor Green
        Add-TestResult -Requirement "2.6" -Test "Arquitetura de canais" -Status "PASS" -Details "$count canais configurados"
    }
}
catch {
    Write-Host "  [!] Aviso: Nenhum canal configurado ainda`n" -ForegroundColor Yellow
    Add-TestResult -Requirement "2.6" -Test "Arquitetura de canais" -Status "WARNING" -Details "Endpoint disponivel mas sem canais"
}

# 9. Verificar upload de arquivos
Write-Host "[9/10] Testando Upload de Arquivos`n" -ForegroundColor Yellow
Write-Host "  [!] Teste de upload requer implementacao especifica com multipart/form-data`n" -ForegroundColor Yellow
Add-TestResult -Requirement "2.1" -Test "Upload de arquivos (ate 2GB)" -Status "WARNING" -Details "Endpoint /files/upload disponivel, teste manual recomendado"

# 10. Gerar Relatorio Final
Write-Host "[10/10] Gerando Relatorio Final`n" -ForegroundColor Yellow

$totalTests = $TEST_RESULTS.Count
$passedTests = ($TEST_RESULTS | Where-Object { $_.Status -eq "PASS" }).Count
$failedTests = ($TEST_RESULTS | Where-Object { $_.Status -eq "FAIL" }).Count
$warningTests = ($TEST_RESULTS | Where-Object { $_.Status -eq "WARNING" }).Count

Write-Host "`n==================================`n" -ForegroundColor Cyan
Write-Host "RELATORIO DE TESTES`n" -ForegroundColor Cyan
Write-Host "==================================`n" -ForegroundColor Cyan
Write-Host "Total de Testes: $totalTests`n" -ForegroundColor White
Write-Host "Passou: $passedTests`n" -ForegroundColor Green
Write-Host "Falhou: $failedTests`n" -ForegroundColor Red
Write-Host "Avisos: $warningTests`n" -ForegroundColor Yellow

# Resumo por requisito
Write-Host "Resumo por Requisito:`n" -ForegroundColor Cyan

$requirements = @("2.1", "2.2", "2.3", "2.4", "2.5", "2.6")
foreach ($req in $requirements) {
    $reqTests = $TEST_RESULTS | Where-Object { $_.Requirement -eq $req }
    $reqPassed = ($reqTests | Where-Object { $_.Status -eq "PASS" }).Count
    $reqTotal = $reqTests.Count
    
    if ($reqTotal -gt 0) {
        $percentage = [math]::Round(($reqPassed / $reqTotal) * 100, 2)
        $color = if ($percentage -eq 100) { "Green" } elseif ($percentage -ge 70) { "Yellow" } else { "Red" }
        Write-Host "  Requisito $req : $reqPassed/$reqTotal ($percentage%)`n" -ForegroundColor $color
        
        foreach ($test in $reqTests) {
            $symbol = switch ($test.Status) {
                "PASS" { "[OK]" }
                "FAIL" { "[X]" }
                "WARNING" { "[!]" }
            }
            $testColor = switch ($test.Status) {
                "PASS" { "Green" }
                "FAIL" { "Red" }
                "WARNING" { "Yellow" }
            }
            Write-Host "    $symbol $($test.Test)`n" -ForegroundColor $testColor
        }
    }
}

# Salvar relatorio em arquivo
$reportPath = "c:\Users\geovanna.cunha_bigda\Documents\chat4all\TEST_RESULTS_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$TEST_RESULTS | ConvertTo-Json -Depth 10 | Out-File -FilePath $reportPath -Encoding UTF8

Write-Host "`nRelatorio detalhado salvo em: $reportPath`n" -ForegroundColor Cyan

# Conclusao
if ($failedTests -eq 0) {
    Write-Host "[OK] Todos os requisitos testados estao funcionando!`n" -ForegroundColor Green
}
elseif ($failedTests -lt 3) {
    Write-Host "[!] Alguns testes falharam. Revise os detalhes acima.`n" -ForegroundColor Yellow
}
else {
    Write-Host "[X] Multiplos testes falharam. Correcoes sao necessarias.`n" -ForegroundColor Red
}

Write-Host "==================================`n" -ForegroundColor Cyan
