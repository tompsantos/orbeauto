# Checklist de Implementação: Emissão Fiscal GISS/NFS-e

Este documento resume as implementações, correções e os scripts de teste disponíveis para validar o fluxo de emissão fiscal da NFS-e via GISS no backend.

## 1. O que foi corrigido e implementado

### Fase A: Auditoria Técnica
- Auditoria completa realizada e documentada em `docs/fiscal-giss-emissao-auditoria.md`.
- Mapeadas divergências entre o gerador de XML e os schemas XSD oficiais (especialmente `CodigoPais` e `RegimeEspecialTributacao`).

### Fase B: Validação XSD Local
- Adicionada a função `giss_validate_xml_against_xsd` no `backend/main.py`.
- A função carrega os schemas XSD oficiais do GISS copiados para `backend/fiscal/xsd/`.
- O endpoint `POST /orders/{order_id}/fiscal/preflight` agora retorna os resultados da validação XSD (`xsd_valid`, `xsd_errors`, `xsd_warnings`).

### Fase C: Correção do Gerador XML
- A tag `CodigoPais` com valor `1058` foi movida para dentro da função `build_giss_rps_lab_xml`, sendo inserida na posição exata exigida pelo XSD (`tcDadosServico`: entre `CodigoMunicipio` e `ExigibilidadeISS`).
- O namespace da tag `RegimeEspecialTributacao` foi corrigido para utilizar o prefixo `p1` (`NS_TIPOS`).
- A função auxiliar `giss_xmlsec_ensure_codigo_pais` foi mantida apenas como um *fallback* de segurança (no-op na prática).

### Fase D: Envio Controlado ao GISS
- O endpoint `POST /orders/{order_id}/fiscal/issue` foi atualizado para invocar a validação XSD antes do envio.
- A requisição só prossegue para a assinatura e envio SOAP se a validação XSD for bem-sucedida (ou se `skip_xsd=true` for explicitamente passado, apenas para debug).
- As travas de segurança (`GISS_ALLOW_REAL_SEND=true` e confirmação explícita `confirm=EMITIR_NFSE_REAL`) foram mantidas e validadas.

### Fase E: Consulta de Lote (Assíncrono)
- Criada a função `giss_build_consultar_lote_rps_xml` para gerar o envelope de consulta.
- Criada a função `giss_process_consultar_lote_response` para fazer o parse do XML de resposta, extrair `Situacao`, `NumeroNfse`, `CodigoVerificacao` e atualizar o `FiscalDocument`.
- Implementado o endpoint `POST /orders/{order_id}/fiscal/consult` que executa a consulta e retorna o payload formatado.

## 2. O que ainda depende do ambiente real do GISS
- **Certificado Digital A1:** O envio real e a assinatura requerem um certificado PFX válido configurado via Docker secrets (`GISS_A1_CERT_PATH` e `GISS_A1_CERT_PASSWORD_FILE`).
- **Credenciais e Autorização:** O CNPJ e Inscrição Municipal do prestador precisam estar autorizados no ambiente de homologação/produção do GISS para que o SOAP retorne sucesso em vez de erros de autenticação.
- **URL do WebService:** A variável `GISS_WS_URL` precisa apontar para o endpoint correto do município no ambiente desejado.

## 3. Como testar via CURL (Scripts de Verificação)

**Importante:** Os comandos abaixo assumem que você possui um `order_id` válido e um token de autenticação JWT (`$TOKEN`).

### 3.1. Teste de Preflight (Validação Local sem Envio)
Gera o XML, assina e valida contra o XSD localmente. Não envia nada ao GISS.

```bash
curl -X POST "http://localhost:8000/orders/{order_id}/fiscal/preflight" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json"
```

### 3.2. Teste de Emissão Real Controlada
Requer que as variáveis de ambiente de segurança estejam ativas (`GISS_ALLOW_REAL_SEND=true`).

```bash
curl -X POST "http://localhost:8000/orders/{order_id}/fiscal/issue?confirm=EMITIR_NFSE_REAL" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json"
```

### 3.3. Teste de Consulta de Lote / Protocolo
Se a emissão real retornou um protocolo (fluxo assíncrono), consulte o status do processamento.

```bash
curl -X POST "http://localhost:8000/orders/{order_id}/fiscal/consult" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json"
```

## 4. Respostas Finais

- **O XML atual estava correto ou não?**
  Estava quase correto, mas a tag `CodigoPais` estava sendo injetada por fora do gerador principal e a tag `RegimeEspecialTributacao` estava sem o namespace correto.
- **O que exatamente foi corrigido?**
  A ordem e o namespace dos elementos no gerador principal, a implementação da validação estrita XSD local antes do envio, e a criação do fluxo de consulta de lote.
- **Qual era o provável motivo dos erros anteriores de emissão?**
  Erros de validação de schema no servidor do GISS devido à falta de namespace ou elementos fora de ordem, que agora são capturados localmente pelo XSD antes mesmo do envio.
- **O sistema está pronto para teste real controlado?**
  Sim, o backend possui todas as travas de segurança, gera o XML correto e validado, assina adequadamente e possui o fluxo completo (envio e consulta).
- **Quais flags precisam estar ativas para envio real?**
  `GISS_ALLOW_REAL_SEND=true`. Opcionalmente, `GISS_REAL_SEND_ORDER_ID={order_id}` para restringir o envio a um único orçamento. E a requisição deve conter o parâmetro `confirm=EMITIR_NFSE_REAL`.
