# Relatório Técnico: Implementação do Módulo Fiscal GISS/NFS-e no Orbeauto

## Resumo Executivo
O sistema Orbeauto já possui uma base sólida para a integração com a NFS-e via GISS, incluindo a geração de rascunhos fiscais, a assinatura de XMLs (RPS e Lote) e o empacotamento SOAP para comunicação. Contudo, o fluxo atual é limitado ao envio inicial de RPS (síncrono/assíncrono) sem o tratamento do retorno assíncrono (consulta de lote), e a interface do usuário (frontend) ainda é incipiente, dependendo de preenchimento manual de dados que poderiam ser automatizados. O escopo desta análise detalha o que já existe, o que precisa ser ajustado e qual é o caminho mais seguro para implementar o MVP fiscal completo.

## 1. O que o módulo fiscal atual do orbeauto já tem
O backend já possui:
- Estrutura de banco de dados para `FiscalSettings` (configurações da oficina) e `FiscalDocument` (rascunho e histórico de envio da nota).
- Lógica de geração de rascunho (`FiscalDraftPayload`) baseada nos dados do orçamento (tomador, serviço, valores).
- Geração de XML do RPS com a estrutura exigida pelo GISS, incluindo a injeção do `CodigoPais=1058`.
- Fluxo de assinatura digital A1 completo e robusto usando `xmlsec1` e `openssl` para assinar o RPS e o Lote.
- Estruturação do envelope SOAP e comunicação com o Web Service (`giss_soap_call` via `requests_pkcs12`).
- Validação inicial de regras de negócio (CPF/CNPJ, valores maiores que zero, etc.).
- Gatilhos de segurança como `GISS_ALLOW_REAL_SEND` e `GISS_REAL_SEND_ORDER_ID` para impedir envios acidentais em produção.

O frontend já possui:
- Um "wizard" (assistente) para preenchimento manual dos dados do tomador e do serviço.
- Um botão para gerar o rascunho fiscal em orçamentos finalizados.

## 2. O que pode ser aproveitado
Praticamente toda a base do backend pode ser aproveitada. O pipeline de assinatura XML é excelente e lida com as complexidades do padrão ABRASF/GISS (remoção de `schemaLocation`, namespaces corretos, assinatura dupla de RPS e Lote). A estrutura de dados (`FiscalSettings` e `FiscalDocument`) está bem modelada para armazenar o estado e o histórico das requisições.

## 3. O que está incompleto ou incorreto
- **Frontend:** O wizard fiscal exige que o usuário preencha dados que já poderiam vir do cadastro do cliente (endereço completo, cidade, UF, CEP). Não há tela para gerenciar as configurações fiscais da oficina (`FiscalSettings`), nem para visualizar o status do envio (se foi autorizado, se deu erro, link para a NFS-e).
- **Backend:** O fluxo de envio está focado no `RecepcionarLoteRps`, que é assíncrono. O código salva o protocolo, mas não há um worker/cron job ou endpoint claro que faça a requisição `ConsultarLoteRps` para verificar se o lote foi processado e obter o número da NFS-e. Além disso, a validação XSD local não está implementada (o código confia na validação da prefeitura).
- **XML:** Os novos campos da LC 214/2025 (IBS/CBS, tributos federais) estão presentes no XML gerado (`trib`, `IBSCBS`), mas estão fixados com valores zerados ou defaults (`0.00`, `0`). Isso é aceitável para um laboratório inicial, mas precisará de parametrização no futuro.

## 4. Quais dados fiscais faltam no cadastro da oficina
Atualmente, a tabela `Workshop` tem dados básicos. Para a NFS-e, a oficina precisa configurar (`FiscalSettings`):
- Inscrição Municipal.
- Código do Serviço (ex: 14.12).
- CNAE.
- Alíquota do ISS.
- Regime Especial de Tributação e opção pelo Simples Nacional.
- Série do RPS e próximo número.

## 5. Quais dados fiscais faltam no cliente/tomador
A tabela `Customer` armazena nome, telefone, CPF e email. Faltam:
- Inscrição Municipal (para clientes PJ).
- Endereço estruturado (Rua, Número, Bairro, CEP, Cidade, UF). Atualmente é um campo texto livre (`address`), o que dificulta a geração do XML, que exige campos separados.

## 6. Quais dados precisam sair do orçamento para alimentar a NFS-e
- **Tomador:** Nome/Razão Social, CPF/CNPJ, Email, Telefone, Endereço estruturado.
- **Serviço:** Discriminação do serviço (descrição do orçamento + observações da seguradora, se houver).
- **Valores:** Valor total dos serviços. (Peças geralmente não entram na NFS-e, mas dependem da legislação municipal. O sistema já separa `service_amount` de `parts_amount`).

## 7. Qual XML o GISS espera, baseado no manual, XSD e exemplos
O GISS espera um envelope SOAP contendo `nfseCabecMsg` e `nfseDadosMsg`. O `nfseDadosMsg` contém o `EnviarLoteRpsEnvio` (padrão ABRASF 2.04 modificado), que engloba um `LoteRps` com uma lista de `Rps`.
A assinatura digital é obrigatória e deve ocorrer em dois níveis:
1. Assinatura do `InfDeclaracaoPrestacaoServico` (dentro do RPS).
2. Assinatura do `LoteRps`.
O XML deve incluir os blocos `trib` (tributos federais) e `IBSCBS` (novo modelo nacional), conforme as atualizações recentes.

## 8. Quais schemas XSD são essenciais
Para a implementação básica (envio e consulta), os XSDs essenciais são:
- `enviar-lote-rps-envio-v2_04.xsd` (Para validar o envio).
- `consultar-lote-rps-resposta-v2_04.xsd` (Para interpretar o retorno assíncrono).
- `tipos-v2_04.xsd` (Contém as definições dos tipos complexos, como `tcLoteRps` e `tcInfDeclaracaoPrestacaoServico`).
- `xmldsig-core-schema20020212.xsd` (Para a assinatura digital).

## 9. Quais endpoints backend devem existir
Além dos já existentes, é necessário:
- `GET /fiscal/settings` e `PATCH /fiscal/settings` (Já existem, mas precisam ser consumidos pelo frontend).
- `POST /orders/{order_id}/fiscal/consult-protocol` (Para consultar o status de um lote enviado assincronamente).
- `POST /orders/{order_id}/fiscal/cancel` (Para cancelar uma NFS-e emitida).
- `POST /fiscal/validate-xsd` (Opcional, para validação local do XML antes do envio).

## 10. Quais tabelas/colunas/modelos devem existir
Os modelos `FiscalSettings` e `FiscalDocument` já existem e estão adequados. Talvez seja necessário adicionar colunas estruturadas de endereço na tabela `Customer` (CEP, Logradouro, Número, Bairro, Cidade, UF) para evitar que o usuário digite isso manualmente a cada nota.

## 11. Qual tela/fluxo frontend deve existir
1. **Configurações da Oficina:** Uma tela para o dono da oficina inserir Inscrição Municipal, CNAE, Alíquota ISS, etc., e fazer upload do Certificado A1.
2. **Wizard Fiscal (Melhorado):** O wizard atual deve pré-preencher os dados do endereço do tomador (se o cliente já tiver endereço estruturado) e permitir a edição.
3. **Status da Nota:** Na tela do orçamento, mostrar claramente o status ("Enviando", "Autorizada", "Erro"). Se autorizada, mostrar o número da nota, código de verificação e um botão para imprimir/baixar o PDF da NFS-e. Se erro, mostrar a mensagem amigável e permitir reenviar.

## 12. Como validar o XML localmente contra XSD
Pode-se usar a biblioteca `lxml` em Python. O backend carregaria o schema principal (`enviar-lote-rps-envio-v2_04.xsd`) e usaria `etree.XMLSchema(schema_doc).validate(xml_doc)`. Isso previne envios de XMLs malformados, economizando tempo e evitando bloqueios na prefeitura.

## 13. Como estruturar assinatura digital A1 com segurança, sem usar certificado real nesta tarefa
O backend já faz isso corretamente! Ele lê o certificado de um volume montado via Docker (`/run/secrets/giss/prestador_a1.pfx`) e a senha de um arquivo de texto. Isso garante que o certificado não fique no código-fonte nem em variáveis de ambiente expostas. Para testes, pode-se usar um certificado autoassinado (dummy) apenas para testar a geração do hash e do nó `<Signature>`.

## 14. Como lidar com envio, protocolo, retorno, erro e reenvio
O fluxo assíncrono do GISS exige:
1. Enviar o Lote (`RecepcionarLoteRps`).
2. Receber o Protocolo.
3. Consultar o Lote (`ConsultarLoteRps`) usando o Protocolo.
4. O retorno pode ser:
   - Sucesso (Situação 4): Extrair `NumeroNfse` e `CodigoVerificacao`, atualizar `FiscalDocument.status = 'autorizado'`.
   - Erro (Situação 3): Extrair as mensagens de erro, atualizar `FiscalDocument.status = 'erro_giss'` e permitir que o usuário corrija os dados e reenvie (gerando um novo rascunho/XML).
   - Em processamento (Situação 2): Tentar novamente mais tarde.

## 15. Quais logs/auditoria são necessários
O `FiscalDocument` já guarda `giss_sent_xml`, `giss_response_xml`, `giss_messages_json`, `giss_http_status`, `giss_sent_at` e `giss_response_at`. Isso é excelente para auditoria. Deve-se garantir que logs de erros de comunicação (ex: timeout, erro 500 do GISS) também sejam registrados.

## 16. Quais testes mínimos devem ser criados
- **Testes Unitários:**
  - Geração do XML do RPS (verificar se os dados do orçamento mapeiam corretamente para as tags XML).
  - Assinatura XML (verificar se os nós `<Signature>` são inseridos nos locais corretos: dentro do RPS e do Lote).
  - Validação XSD (garantir que um XML válido passa e um inválido falha).
  - Tradução de mensagens de erro do GISS (função `giss_translate_message`).

## 17. Quais riscos técnicos existem
- **Mudanças no GISS:** A introdução dos campos IBS/CBS (LC 214/2025) mostra que a API está em transição. Os schemas podem mudar.
- **Instabilidade do Web Service:** Prefeituras frequentemente têm indisponibilidade. O sistema deve lidar bem com timeouts e permitir consultas posteriores do protocolo.
- **Validação de Endereço:** O GISS é estrito com códigos de município (IBGE). Se o cliente digitar a cidade errada, a nota será rejeitada.

## 18. Qual é o menor MVP fiscal seguro para implementar primeiro
O MVP deve focar apenas no fluxo síncrono ou assíncrono básico, sem cancelamento ou substituição, para uma única oficina.

**Fase 1 (MVP):**
- Adicionar tela de Configurações Fiscais no frontend.
- Melhorar o cadastro de cliente para ter endereço estruturado (Rua, Número, Bairro, CEP, Cidade, UF).
- Implementar a rotina de `ConsultarLoteRps` no backend (já que o envio atual é assíncrono e só guarda o protocolo).
- Atualizar a UI do orçamento para mostrar o status real da nota (com base na consulta do protocolo) e exibir os erros retornados pela prefeitura.

---

## Plano de Implementação por Fases

### É possível implementar em fases?
Sim, perfeitamente. O backend já está muito bem isolado e o uso de feature flags (`FISCAL_FEATURE_KEY`) permite liberar o módulo gradativamente.

### Qual fase deve ser feita primeiro?
A **Fase 1** descrita no MVP acima. O foco deve ser fechar o ciclo de envio: permitir que a oficina configure seus dados, envie a nota (já implementado), consulte o protocolo (falta implementar) e veja o resultado na tela (falta implementar).

### Quais arquivos devem ser alterados na primeira fase?
- **Backend:**
  - `main.py`: Adicionar endpoint para consultar protocolo (`ConsultarLoteRps`) e processar o retorno.
  - Modelos (se decidir estruturar o endereço do cliente): Adicionar colunas em `Customer`.
- **Frontend:**
  - `App.jsx`: Criar painel de configurações fiscais, ajustar o wizard fiscal para buscar dados estruturados e adicionar a interface de status/consulta do protocolo na tela do orçamento.

### O que NÃO deve ser implementado ainda?
- Cancelamento de NFS-e.
- Substituição de NFS-e.
- Emissão em lote (vários orçamentos de uma vez).
- Integração automática com contabilidade.
- Validação XSD local estrita (pode ser deixada para a Fase 2, confiando na validação da prefeitura no MVP).

---

## Próximo prompt recomendado para codar apenas a fase 1
```text
Crie a rotina de consulta de protocolo GISS no backend (ConsultarLoteRps).
1. No arquivo `main.py`, crie a função `giss_consultar_lote_rps_xml(protocolo, cnpj, inscricao_municipal)` que gera o XML da requisição.
2. Crie um endpoint `POST /orders/{order_id}/fiscal/consult` que:
   - Verifique se o `FiscalDocument` possui um `giss_protocol`.
   - Faça a chamada SOAP (`giss_soap_call`) usando o XML gerado.
   - Processe o `output_xml` retornado.
   - Se a situação for 4 (Sucesso), extraia `NumeroNfse` e `CodigoVerificacao`, atualize o status para 'autorizado' e salve no banco.
   - Se a situação for 3 (Erro), extraia as mensagens, atualize o status para 'erro_giss' e salve no banco.
   - Retorne o status atualizado para o frontend.
Não altere a estrutura de assinatura existente. Apenas adicione a lógica de consulta.
```
