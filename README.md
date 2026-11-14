# Fechamento de faturamento

Fork público de [devfullcycle/mba_fullcycle_design_patterns](https://github.com/devfullcycle/mba_fullcycle_design_patterns), iniciado em `master`. A entrega está na branch [`main`](https://github.com/thxago/mba_fullcycle_design_patterns/tree/main).

A simulação original continua sem gravar dados. O fechamento substitui todas as faturas do período/regime de forma atômica, retorna o lote persistido e publica um resumo via Mediator.

| Endpoint | Entrada | Resultado |
| --- | --- | --- |
| `POST /generate_invoices` | JSON com `month`, `year`, `type`, `format?` | Simulação, sem persistência. |
| `POST /close_invoicing` | Mesmo JSON | Substituição atômica do período/regime. |
| `GET /invoices` | `month`, `year`, `type`, `format?` na query string | Faturas persistidas, ordenadas por data crescente. |

`type` aceita `cash` ou `accrual`. `format` aceita `json` (padrão) ou `csv`. JSON retorna uma lista de `{ date, amount }`; CSV retorna texto puro, uma linha `YYYY-MM-DD;amount` por fatura. Período vazio retorna `[]` em JSON ou corpo vazio em CSV.

## Requisitos

- Node.js 24 LTS; versão registrada em `.nvmrc`: **24.22.3**.
- npm e PostgreSQL 16, com permissão para criar a extensão `uuid-ossp`.
- Para executar localmente, cliente `psql` e portas 5432 e 3000 disponíveis.
- Docker é opcional. Há abaixo uma alternativa totalmente isolada, sem ocupar essas portas.

A stack original foi mantida: TypeScript, Express, pg-promise e Jest, sem novas dependências de runtime, ORM ou biblioteca de transações.

## Execução local — PowerShell

```powershell
git clone --branch main https://github.com/thxago/mba_fullcycle_design_patterns.git
Set-Location .\mba_fullcycle_design_patterns
node --version
npm install
```

O adapter original usa `postgres://postgres:123456@localhost:5432/app`. Essa senha é somente a credencial de desenvolvimento do projeto, não uma configuração para produção. Prepare uma instância PostgreSQL **dedicada**, com usuário `postgres` e essa senha:

```powershell
$env:PGPASSWORD = "123456"
psql -h localhost -U postgres -d postgres -c "create database app;"
psql -h localhost -U postgres -d app -v ON_ERROR_STOP=1 -f .\create.sql
npm start
```

A API escuta em `http://localhost:3000`. Os scripts `npm start` e `npm test` definem `TZ=America/Sao_Paulo` dentro do processo Node, inclusive no Windows.

**Atenção:** `create.sql` remove e recria o schema `branas`, inclusive suas faturas. Não executá-lo em banco compartilhado ou com dados importantes. Para conferir a reexecução, pare a API, execute novamente o mesmo comando `psql` e reinicie a API. Para recriar um banco exclusivamente de testes, execute DROP e CREATE em comandos separados:

```powershell
psql -h localhost -U postgres -d postgres -c "drop database if exists app;"
psql -h localhost -U postgres -d postgres -c "create database app;"
psql -h localhost -U postgres -d app -v ON_ERROR_STOP=1 -f .\create.sql
```

O seed contém um contrato de 6000 em 12 períodos, iniciado em 01/01/2022, e um pagamento de 6000 em 05/01/2022. Em janeiro de 2022, accrual gera uma fatura de 500 e cash uma de 6000.

## Alternativa: validação inteiramente isolada com Docker

Os comandos desta seção são para PowerShell, na raiz de um clone limpo. Não exigem Node ou `psql` no host. Docker deve estar configurado para containers Linux. Os caminhos `/workspace` e `/tmp` são internos aos containers.

Use nomes de containers livres e a porta **33000** disponível. O banco não publica a porta 5432; a API compartilha a rede desse container para preservar a conexão fixa `localhost:5432` do projeto.

```powershell
docker run --detach --name faturamento-validacao-db --publish 127.0.0.1:33000:3000 --env POSTGRES_DB=app --env POSTGRES_PASSWORD=123456 --env TZ=America/Sao_Paulo postgres:16
docker exec faturamento-validacao-db pg_isready -U postgres -d app
```

Espere `pg_isready` informar `accepting connections`, repetindo esse comando se necessário. Apenas nesse banco descartável, confira a criação do zero e a reexecução:

```powershell
docker exec faturamento-validacao-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists app;"
docker exec faturamento-validacao-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database app;"
docker cp .\create.sql faturamento-validacao-db:/tmp/create.sql
docker exec faturamento-validacao-db psql -U postgres -d app -v ON_ERROR_STOP=1 -f /tmp/create.sql
docker exec faturamento-validacao-db psql -U postgres -d app -v ON_ERROR_STOP=1 -f /tmp/create.sql

$mount = "type=bind,source=$((Get-Location).Path),target=/workspace"
docker run --rm --network container:faturamento-validacao-db --mount $mount --workdir /workspace node:24.22.3-bookworm-slim npm install
docker run --detach --name faturamento-validacao-api --network container:faturamento-validacao-db --mount $mount --workdir /workspace node:24.22.3-bookworm-slim npm start
docker logs faturamento-validacao-api
```

Espere a API iniciar antes das requisições abaixo. Nessa alternativa, use `$api = "http://localhost:33000"`. Nos comandos de validação, `docker logs faturamento-validacao-api` permite conferir os resumos publicados.

## Roteiro de validação HTTP

Com a API ativa, em outro PowerShell:

```powershell
$api = "http://localhost:3000" # No ambiente Docker isolado: http://localhost:33000
$accrual = '{"month":1,"year":2022,"type":"accrual"}'
$cashCsv = '{"month":1,"year":2022,"type":"cash","format":"csv"}'
$simulation = '{"month":1,"year":2022,"type":"accrual","format":"csv"}'

(Invoke-WebRequest "$api/close_invoicing" -Method Post -ContentType "application/json" -Body $accrual).Content
(Invoke-WebRequest "$api/invoices?month=1&year=2022&type=accrual").Content

# Reprocessamento: o GET deve continuar retornando exatamente uma fatura.
(Invoke-WebRequest "$api/close_invoicing" -Method Post -ContentType "application/json" -Body $accrual).Content
(Invoke-WebRequest "$api/invoices?month=1&year=2022&type=accrual").Content

(Invoke-WebRequest "$api/close_invoicing" -Method Post -ContentType "application/json" -Body $cashCsv).Content
(Invoke-WebRequest "$api/invoices?month=1&year=2022&type=cash&format=csv").Content
(Invoke-WebRequest "$api/invoices?month=3&year=2023&type=cash").Content

# Simulação: não altera o fechamento accrual já persistido.
(Invoke-WebRequest "$api/generate_invoices" -Method Post -ContentType "application/json" -Body $simulation).Content
(Invoke-WebRequest "$api/invoices?month=1&year=2022&type=accrual").Content
```

Resultados esperados:

- Accrual: `[{"date":"2022-01-01T13:00:00.000Z","amount":500}]`, antes e depois do reprocessamento e da simulação.
- Cash em CSV: `2022-01-05;6000`, sem aspas, nos dois endpoints.
- Período sem faturas: `[]`.
- Simulação em CSV: `2022-01-01;500`, sem aspas.
- A cada fechamento, o console imprime o resumo correspondente, por exemplo `{ month: 1, year: 2022, type: 'accrual', invoices: 1, total: 500 }`. O resumo não integra a resposta HTTP.

## Testes e verificações

Com PostgreSQL preparado e a API **ainda ativa na porta 3000**, execute em outro terminal:

```powershell
npm test
npx --no-install tsc --noEmit
```

No ambiente Docker isolado, a porta interna continua sendo 3000:

```powershell
docker exec faturamento-validacao-api npm test
docker exec faturamento-validacao-api npx --no-install tsc --noEmit
```

A suíte possui **51 testes em 11 arquivos**. O teste HTTP original requer uma API externa ativa; os testes HTTP novos criam servidores em portas temporárias. O ponta a ponta novo aplica o DDL/seed em um schema exclusivo e o remove ao terminar. Os testes de repository utilizam períodos livres e removem seus registros.

Os três arquivos do professor preservam seus sete casos e 12 asserts; somente a montagem de GenerateInvoices foi adaptada. Os testes adicionais comprovam atomicidade, reprocessamento, formatos, consulta, eventos e ausência de escrita na simulação.

Em Linux/macOS, na execução local, os comandos explícitos equivalentes são `TZ=America/Sao_Paulo npx ts-node src/main.ts` e, em outro terminal, `TZ=America/Sao_Paulo npx jest --runInBand`. Os scripts npm já configuram o mesmo timezone.

Para inspecionar DIP no PowerShell, a busca abaixo não deve imprimir resultados:

```powershell
Get-ChildItem .\src\application, .\src\domain -Recurse -Filter *.ts |
    Select-String -Pattern "from\s+['`"][^'`"]*infra"
```

Na validação Docker, a mesma inspeção pode ser feita dentro do container:

```powershell
docker exec faturamento-validacao-api grep -rEn 'from .*infra' src/application src/domain
```

O `grep` retorna código 1 quando não encontra imports, que é o resultado esperado.

## Arquitetura e atomicidade

A aplicação depende das portas de repository, PresenterFactory e Mediator; a infraestrutura implementa essas portas. `src/main.ts` monta as dependências, registra SendEmail em `InvoicesGenerated` e `InvoicesClosed` e envolve o fechamento com LoggerDecorator. As strategies e o Invoice de domínio permanecem inalterados.

A transação vive em `InvoiceDatabaseRepository.replacePeriod`: o DELETE do período/regime e todos os INSERTs usam o mesmo contexto de `DatabaseConnection.transaction`, implementado por `PgPromiseAdapter` com `pg-promise.tx`. Commit acontece ao concluir o callback; qualquer falha desfaz o lote e a remoção anterior. `InvoiceDatabaseRepository.test.ts` força uma violação de FK na segunda fatura de CloseInvoicing, após uma primeira inserção válida, e compara todas as colunas das duas faturas anteriores, inclusive IDs; ambas permanecem intactas e nenhum evento é publicado.

CloseInvoicing gera contrato a contrato, associa `idContract` sem modificar Invoice, aguarda a persistência e publica `{ month, year, type, invoices, total }`. A resposta usa o próprio lote executado, não uma releitura. Lote vazio remove o fechamento anterior e publica quantidade/total zero.

O contrato HTTP usa callbacks assíncronos na ordem **`(params, body, headers, query)`**: parâmetros de rota, corpo, cabeçalhos e query string. Os três primeiros argumentos foram preservados. O controller converte month/year da query para números, sem expor tipos de Express à aplicação. Strings saem como `text/plain`; objetos e arrays mantêm `res.json`.

## Limitações e decisões preservadas

- A conexão fixa do professor foi mantida. A alternativa Docker compartilha a rede entre API e banco, sem alterar a aplicação.
- As datas dependem do timezone do processo; os scripts configuram America/Sao_Paulo sem mudar cálculos ou asserts.
- `create.sql` é o mecanismo de schema e é destrutivo. Agora inclui a extensão e `DROP SCHEMA IF EXISTS`, permitindo primeira execução e reexecução com `ON_ERROR_STOP=1`.
- `Invalid type` e `Invalid format` são contratos de erro testados nos casos de uso/factory. Formato inválido é rejeitado antes de qualquer escrita; regime é validado mesmo sem contratos.
- Não há tratamento global de erros HTTP: uma exceção pode encerrar a API, como no projeto base. Use entradas válidas no roteiro HTTP.
- Um fechamento por vez é a premissa. Não há autenticação, controle de concorrência, edição individual ou envio real de email; SendEmail continua sendo um stub de console.
- O N+1 de payments, as regras das strategies e a organização em camadas foram mantidos. Reinicie a API se recriar o schema para não reutilizar um pool anterior ao reseed.

## Encerrar a validação Docker

Depois das requisições e dos testes, estes comandos removem **somente os containers descartáveis criados neste README**, incluindo o volume anônimo do banco:

```powershell
docker stop faturamento-validacao-api faturamento-validacao-db
docker rm -v faturamento-validacao-api faturamento-validacao-db
```
