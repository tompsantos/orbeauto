# Auditoria Técnica: Emissão Fiscal GISS/NFS-e

## Fase A: Diagnóstico Técnico do XML Atual

Esta auditoria compara a implementação atual no backend do Orbeauto (`main.py`) com os documentos oficiais do GISS (Manual Técnico v1.5, schemas XSD e exemplos XML).

### 1. Funções que geram o XML do RPS/Lote
A função principal que gera o XML de envio do lote é `build_giss_rps_lab_xml` (linhas 1621-1800). Ela constrói o XML `EnviarLoteRpsEnvio` usando `xml.etree.ElementTree`.
Outra função relevante é `giss_consultar_nfse_por_rps_xml` (linha 2661), que gera o XML de consulta por RPS de forma manual (string formatting).

### 2. Funções que assinam o XML
O processo de assinatura é orquestrado pela função `sign_giss_rps_lab_xml` (linha 3407), que utiliza a biblioteca `xmlsec1` através da função auxiliar `giss_xmlsec_sign_file`. O processo extrai a chave privada e o certificado do arquivo PFX (`giss_xmlsec_extract_pem_files`) e gera os templates de assinatura (`giss_xmlsec_signature_template`).

### 3. Funções que montam o SOAP
A montagem do envelope SOAP é feita pela função `giss_soap_envelope` (linha 2558). Ela encapsula o cabeçalho (`giss_default_header_xml`) e os dados (`dados_xml`) dentro das tags `<nfseCabecMsg>` e `<nfseDadosMsg>`, realizando o escape dos caracteres especiais (`giss_xml_escape`).

### 4. Funções que enviam ao GISS
O envio é realizado pela função `giss_soap_call` (linha 2620), que utiliza a biblioteca `requests_pkcs12` para fazer a requisição HTTP POST autenticada com o certificado digital (TLS mútuo). O endpoint de emissão real de teste é o `fiscal_giss_send_lab` (linha 2818).

### 5. Divergências entre o XML atual e Manual/XSD/Exemplos
- **Namespace do elemento raiz:** O XML gerado define o `schemaLocation` usando o prefixo `xsi:schemaLocation` na raiz `EnviarLoteRpsEnvio`. Os exemplos oficiais e os XSDs usam a mesma estrutura.
- **Ordem dos elementos em `Valores`:** O XSD `nfse_v2-04.xsd` (`tcValoresDeclaracaoServico`, linha 2535) define a ordem estrita dos elementos dentro de `Valores`. O código atual (linhas 1699-1743) gera os elementos, mas o XSD não prevê `ValorDeducoes` seguido de `ValorPis` se o serviço for diferente. A ordem atual parece estar alinhada com o XSD, mas precisa de validação estrita.
- **Bloco `IBSCBS`:** O código atual gera a tag `<tpOper>1</tpOper>`, `<gRefNFSe>` e `<tpEnteGov>` (linhas 69-73 do exemplo máximo), mas a implementação no `main.py` (linhas 1731-1743) **omite** esses campos que estão no exemplo máximo. O exemplo mínimo (linha 38) também omite, o que indica que são opcionais, mas o XSD deve ser a fonte da verdade.
- **`trib` e `IBSCBS`:** O XSD confirma que o grupo `trib` (linha 2563) e `IBSCBS` (linha 2570) são **obrigatórios** dentro de `Valores`. A implementação atual os inclui, mas com valores fixos zerados.
- **`CodigoPais`:** O XSD (`tcDadosServico`, linha 2713) define a ordem: `CodigoMunicipio`, `CodigoPais` (opcional), `ExigibilidadeISS`. O código atual tem uma função `giss_xmlsec_ensure_codigo_pais` (linha 2330) que injeta o `CodigoPais=1058` antes de assinar. Isso é perigoso, pois modifica o XML fora do gerador principal, mas a posição está correta.

### 6. Posição da assinatura
A assinatura do RPS deve referenciar o `Id` do `InfDeclaracaoPrestacaoServico` e ser inserida como irmã deste elemento, dentro do wrapper `Rps`. A função `sign_giss_rps_lab_xml` (linha 3468) faz isso corretamente: `rps_wrapper.insert(rps_wrapper.index(inf) + 1, rps_sig)`. A assinatura do lote deve referenciar o `Id` do `LoteRps` e ser inserida após ele (linha 3500). Isso está correto.

### 7. Ordem das assinaturas
O código atual assina primeiro o RPS e depois o Lote. Esta é a ordem correta exigida pelo padrão ABRASF, pois a assinatura do Lote engloba o RPS já assinado.

### 8. Namespaces
Os namespaces gerados:
- `xmlns:p="http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd"`
- `xmlns:p1="http://www.giss.com.br/tipos-v2_04.xsd"`
Estão corretos e condizem com os exemplos oficiais.

### 9. SOAPAction
O `SOAPAction` gerado é `http://nfse.abrasf.org.br/{operation}` (linha 2637). O WSDL (`nfse-main.wsdl`) define o `soapAction` como `http://nfse.abrasf.org.br/RecepcionarLoteRps`. Está correto.

### 10. `nfseCabecMsg` e `nfseDadosMsg`
O WSDL (`nfse-import.wsdl`) define que essas tags devem conter `string`. O código atual escapa o XML gerado (transformando `<` em `&lt;`) antes de inserir nessas tags (linha 2564). Isso está correto e é o padrão exigido.

### 11. Obrigatoriedade dos blocos `trib` e `IBSCBS`
Sim, o XSD `nfse_v2-04.xsd` (`tcValoresDeclaracaoServico`) define `trib` (linha 2563) e `IBSCBS` (linha 2570) com `minOccurs="1"`. Eles são obrigatórios, justificando a inclusão deles zerados no código atual.

### 12. Posição do `CodigoPais=1058`
A injeção manual feita pela função `giss_xmlsec_ensure_codigo_pais` garante que o `CodigoPais` fique entre `CodigoMunicipio` e `ExigibilidadeISS`. O XSD confirma essa ordem. No entanto, é melhor que o gerador principal (`build_giss_rps_lab_xml`) já inclua esse elemento na ordem correta, evitando a manipulação da árvore antes da assinatura.

### 13. Divergência com exemplos oficiais
O exemplo máximo contém o elemento `<tpOper>1</tpOper>` dentro de `IBSCBS`. O gerador atual omite esse elemento. O XSD `TCRTCInfoIBSCBS` precisaria ser verificado para confirmar se `tpOper` é obrigatório. Se for, a validação XSD falhará.

### 14. Captura de erros atuais
O código atual extrai as mensagens de erro através da função `giss_extract_messages` e as traduz em `giss_translate_message`. Ele captura corretamente erros como `A01` (erro de processamento), `E160` (incompatibilidade XML) e `E174` (erro de assinatura). O diagnóstico técnico é retornado ao frontend.

## Lista de Correções Necessárias

1. **Validação XSD Local (Fase B):** Implementar a validação estrita usando `lxml.etree.XMLSchema` contra o `enviar-lote-rps-envio-v2_04.xsd` antes de assinar e enviar.
2. **Correção do Gerador XML (Fase C):** Mover a inserção do `CodigoPais=1058` para dentro da função `build_giss_rps_lab_xml` na ordem exata definida pelo XSD, eliminando a necessidade da função injetora gambiarra `giss_xmlsec_ensure_codigo_pais`.
3. **Endpoint de Emissão (Fase D):** Ajustar o `fiscal_giss_send_lab` para incluir a etapa de validação XSD e garantir o salvamento correto de todos os dados do retorno.
4. **Consulta de Lote (Fase E):** Implementar a geração do XML `ConsultarLoteRpsEnvio` e o endpoint para processar o retorno assíncrono.
