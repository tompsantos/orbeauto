# orbeauto

sistema web para gestão operacional de oficinas automotivas, criado dentro do ecossistema orbe.

## visão geral

o orbeauto centraliza o fluxo de atendimento de uma oficina, desde o orçamento até a finalização do serviço.

## recursos atuais

- cadastro de cliente
- cadastro de veículo
- orçamento para particular ou seguradora
- fotos do antes e depois
- documentos do veículo
- status operacional do serviço
- painel administrativo
- geração de PDF comercial
- módulo fiscal em modo rascunho
- preparação técnica para emissão de NFS-e via Giss Online

## módulo fiscal

o módulo fiscal está em modo pendente de emissão giss.

o sistema já prepara rascunho fiscal, dados do tomador, descrição do serviço e XML técnico. a emissão automática permanece pausada até retorno do suporte Giss/Jaboticabal.

## stack

- frontend: React + Vite
- backend: FastAPI
- banco: PostgreSQL
- proxy: Nginx
- deploy: Docker Compose
- servidor: VPS Linux

## segurança

este repositório não deve conter:

- arquivos `.env`
- certificados digitais
- senhas
- chaves privadas
- uploads reais
- XMLs fiscais reais
- PDFs de notas reais
- dumps de banco
