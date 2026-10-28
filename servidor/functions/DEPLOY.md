# Como colocar o pagamento automático no ar (Google Cloud Shell)

Tudo é feito no navegador, sem instalar nada no seu computador. Você já está logado no Google/Firebase. Reserve uns 40 minutos. Faça primeiro tudo no **SANDBOX** (dinheiro de mentira) e só depois passe para a produção.

## Antes de começar (uma vez só)
1. Console Firebase > projeto **planejar-obras** > engrenagem > **Uso e faturamento** > mude o plano para **Blaze** (as funções exigem). Coloque alerta de orçamento em R$ 10.
2. Crie a conta no Asaas (https://www.asaas.com) e outra no **sandbox** (https://sandbox.asaas.com). No sandbox: **Integrações > Chave de API > Gerar**. Copie a chave (começa com `$aact_`).
3. Gmail `planejarobrascentral@gmail.com`: ligue a verificação em duas etapas e crie uma **senha de app** (Conta Google > Segurança > Senhas de app). Copie as 16 letras.
4. Invente duas senhas longas (32 letras ou mais, sem espaço), uma para o **token do webhook do Asaas** e outra para o **token de verificação do WhatsApp**. Guarde num papel.

## 1. Abrir o Cloud Shell e baixar o projeto
Abra https://console.cloud.google.com, escolha o projeto **planejar-obras** e clique no ícone `>_` (Ativar o Cloud Shell) no alto. Cole:

```
git clone https://github.com/planejarengenharia/planejar-obras-atualizacoes.git
cd planejar-obras-atualizacoes/servidor/functions
npm install
```

## 2. Testar sem internet (opcional, 10 segundos)
```
npm test
```
Deve terminar com `# fail 0`.

## 3. Cadastrar os segredos (você digita os valores; nada vai para o repositório)
Cada comando pede o valor; cole e dê Enter.

```
firebase functions:secrets:set ASAAS_API_KEY        # chave do SANDBOX (depois, a de produção)
firebase functions:secrets:set ASAAS_WEBHOOK_TOKEN  # a senha longa nº 1
firebase functions:secrets:set ASAAS_AMBIENTE       # digite: sandbox   (depois: producao)
firebase functions:secrets:set SMTP_USUARIO         # planejarobrascentral@gmail.com
firebase functions:secrets:set SMTP_SENHA           # a senha de app do Gmail (16 letras)
firebase functions:secrets:set WA_ATIVO             # digite: nao   (mude para sim quando o WhatsApp estiver aprovado)
firebase functions:secrets:set WA_TOKEN             # token da Meta (ou digite: x, enquanto WA_ATIVO for nao)
firebase functions:secrets:set WA_PHONE_ID          # ID do número da Meta (ou: x)
firebase functions:secrets:set WA_VERIFY_TOKEN      # a senha longa nº 2
firebase functions:secrets:set WA_APP_SECRET        # "Chave secreta do app" da Meta (ou: x)
```
Se aparecer pergunta de ativar APIs (Secret Manager, Cloud Build...), responda **y**.

## 4. Publicar as funções e as regras
```
firebase deploy --only functions,firestore:rules
```
Na primeira vez pode dar erro de permissão: espere 2 minutos e rode de novo. No fim aparecem as URLs. Anote:
- `webhookAsaas` → algo como `https://webhookasaas-XXXX-rj.a.run.app` (ou `https://southamerica-east1-planejar-obras.cloudfunctions.net/webhookAsaas`)
- `whatsappWebhook` → idem

Para ver as URLs depois: `firebase functions:list`.

## 5. Cadastrar o webhook no painel do Asaas (sandbox primeiro)
Painel Asaas > **Integrações > Webhooks > Criar webhook**:
- **URL**: a do `webhookAsaas`.
- **Token de autenticação**: a mesma senha longa nº 1 (`ASAAS_WEBHOOK_TOKEN`).
- **E-mail** para avisos de falha: planejarobrascentral@gmail.com. **Fila de sincronização: ligada**. Versão da API: v3.
- **Eventos a marcar**:
  - Cobranças: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`.
  - Assinaturas: `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`.
  - Notas fiscais: `INVOICE_AUTHORIZED`.
  (Os outros eventos podem ficar desligados; se ligar, o servidor só ignora.)

## 6. Dar a você o poder de responder chamados
Se ainda não fez: Firestore > coleção `admins` > documento com o seu UID (ver `SERVIDOR_PRONTO.md`). Sem isso `responderChamado` recusa.

## 7. Notificações nativas do Asaas (deixe LIGADAS)
Painel Asaas > **Configurações da conta > Notificações** (ou no cadastro de cada cliente, que o servidor cria com notificações ligadas):
- **E-mail**: aviso de cobrança criada, lembrete antes do vencimento, cobrança vencida, pagamento confirmado: ligados.
- **SMS** e **WhatsApp do Asaas**: ligue os de "cobrança vencida" e "lembrete" se quiser reforço (podem ter custo por mensagem; veja a tabela do Asaas).
- Isso é separado das mensagens do Planejar: o cliente recebe o recibo do Asaas e a mensagem de boas-vindas do Planejar.

**Nota fiscal automática**: Asaas > Notas fiscais > Informações fiscais (município, CNAE, ISS) e marque **emitir nota fiscal automaticamente para assinaturas/cobranças recebidas**. Quando a nota sai, o link aparece sozinho nas faturas do cliente.

## 8. WhatsApp automático (Meta Business) — pode ser feito depois do pagamento
O sistema funciona sem isso (só e-mail). Para ligar:
1. https://business.facebook.com > criar/entrar na conta **Meta Business** da Planejar. Em **Configurações > Central de segurança**, faça a **verificação da empresa** (CNPJ 36.004.997/0001-03, documentos que ele pedir; leva de horas a alguns dias).
2. https://developers.facebook.com > **Meus apps > Criar app** > tipo **Empresa** > adicione o produto **WhatsApp**. Vincule à conta Meta Business.
3. **Número dedicado**: use um chip/número que NÃO esteja em uso no WhatsApp comum (ou apague o WhatsApp dele). Em WhatsApp > **Configuração da API > Adicionar número de telefone**, confirme por SMS/ligação. Esse número vira o "Planejar Obras".
4. Copie: **ID do número de telefone** (`WA_PHONE_ID`). Em **Configurações do app > Básico** copie a **Chave secreta do app** (`WA_APP_SECRET`). Crie um **token permanente**: Business Settings > Usuários do sistema > adicionar (admin) > atribuir o app e a conta do WhatsApp > Gerar token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` (`WA_TOKEN`).
5. **Webhook**: WhatsApp > Configuração > Webhook > Editar: **URL de callback** = a do `whatsappWebhook`; **Token de verificação** = a senha longa nº 2 (`WA_VERIFY_TOKEN`) > Verificar e salvar. Depois **assine o campo `messages`**.
6. **Modelos de mensagem** (WhatsApp Manager > Modelos de mensagem > Criar). Idioma **Português (BR)**; o **nome** precisa ser idêntico (letras minúsculas). Categoria entre parênteses. Cole o texto exato (`{{1}}` etc. são as variáveis; a Meta pede um exemplo para cada: use "Ana", "Fundador", "15/12/2026", "https://exemplo.com"):

   - **boas_vindas_cortesia** (UTILITY) — variáveis: {{1}}=nome
     > Olá, {{1}}! Sua conta no Planejar Obras foi criada e a cortesia de 3 meses já está valendo: até 5 orçamentos e tudo liberado. Qualquer dúvida, é só responder esta mensagem.

   - **dica_dia3** (MARKETING) — variáveis: {{1}}=nome
     > Olá, {{1}}! Dica do Planejar Obras: escolha a tabela de preços (SINAPI, SEINFRA, ORSE) e o estado da obra logo no início, que o orçamento sai certo. Dúvidas? Responda esta mensagem.

   - **dica_dia7** (MARKETING) — variáveis: {{1}}=nome
     > Olá, {{1}}! Já fez a primeira medição? Use o celular na obra para registrar os serviços e o Planejar Obras calcula o boletim para você. Precisa de ajuda? Responda esta mensagem.

   - **meio_cortesia_dia30** (MARKETING) — variáveis: {{1}}=nome
     > Olá, {{1}}! Sua cortesia do Planejar Obras está na metade do caminho. Aproveite para testar o Planejar Projetos e a medição. Se precisar de ajuda, responda esta mensagem.

   - **faltam_30_dias** (UTILITY) — variáveis: {{1}}=nome
     > Olá, {{1}}! Faltam cerca de 30 dias para terminar a sua cortesia do Planejar Obras. Para continuar sem pausa, escolha um plano em Minha conta. Responda 2 para receber o link.

   - **faltam_7_dias** (UTILITY) — variáveis: {{1}}=nome
     > Olá, {{1}}! Faltam 7 dias para terminar a sua cortesia do Planejar Obras. Escolha um plano em Minha conta (PIX, boleto ou cartão) para não parar o trabalho. Suas obras continuam no seu computador.

   - **pagamento_confirmado** (UTILITY) — variáveis: {{1}}=nome, {{2}}=plano, {{3}}=validade
     > Olá, {{1}}! Recebemos o seu pagamento. O plano {{2}} do Planejar Obras está liberado até {{3}}. Obrigado!

   - **pagamento_atrasado** (UTILITY) — variáveis: {{1}}=nome, {{2}}=plano, {{3}}=link
     > Olá, {{1}}! Não identificamos o pagamento do plano {{2}} do Planejar Obras. Para pagar ou pegar a 2ª via, use este link: {{3}}

   - **assinatura_cancelada** (UTILITY) — variáveis: {{1}}=nome, {{2}}=validade
     > Olá, {{1}}! Sua assinatura do Planejar Obras foi cancelada e não será renovada. Você continua usando o plano até {{2}}.

   - **renovacao_7_dias** (UTILITY) — variáveis: {{1}}=nome, {{2}}=validade
     > Olá, {{1}}! Seu plano do Planejar Obras vence em 7 dias, em {{2}}, e não renova sozinho. Assine em Minha conta para continuar sem pausa.

   - **chamado_respondido** (UTILITY) — variáveis: {{1}}=nome, {{2}}=assunto
     > Olá, {{1}}! Respondemos ao seu chamado "{{2}}" no Planejar Obras. Abra Minha conta, aba Suporte, para ler a resposta.

   Espere a aprovação de todos (normalmente minutos; os de MARKETING podem demorar mais).
7. Ligue: `firebase functions:secrets:set WA_ATIVO` → digite **sim**, e rode de novo `firebase deploy --only functions`.
8. Teste: do seu celular mande "oi" para o número da Planejar. Deve chegar o menu (1 Planos, 2 Assinar/2ª via, 3 Suporte, 4 Falar com o Júnior).
Observações: o cliente só recebe mensagem de aviso se marcou "Quero receber avisos pelo WhatsApp" (`whatsOk`). Quando o cliente escreve primeiro, o robô responde sem precisar de modelo (janela de 24 h). Para desligar tudo: `WA_ATIVO` = nao e republique.

## 9. Roteiro de teste no SANDBOX (obrigatório antes de produção)
Dados: ambiente `sandbox`, chave do sandbox, webhook do sandbox apontando para a URL acima.
1. No programa, crie uma conta de teste (e-mail seu, confirme o e-mail). Marque o WhatsApp se quiser testar.
2. Em Minha conta > Planos escolha **Essencial mensal** > Assinar (CPF de teste válido, por exemplo 529.982.247-25). Deve abrir o link da fatura do Asaas sandbox.
3. **Cartão**: escolha Cartão de crédito e use o cartão de teste do Asaas: número `5162 3061 8112 9012` (aprovação), validade futura qualquer (ex.: 12/2030), CVV `318`, nome qualquer. (Se o Asaas mudar o cartão, a documentação "Cartões para testes" no site deles lista os atuais.)
   Resultado esperado em até 1 minuto: e-mail "Pagamento confirmado", aviso dentro do programa, e no Firestore `contas/{uid}`: `plano = essencial`, `f` = vencimento do mês seguinte + 5 dias, `maq = 1`, `mod = [obras, sem_licitacao]`, `assin.status = ativa`; `pagamentos/{id}` com `status = pago`; `eventos/...` com `estado = ok`.
4. **PIX/boleto**: gere outra assinatura (cancele a anterior) e no painel do sandbox abra a cobrança > **Simular pagamento / "Confirmar recebimento"**. O resultado é o mesmo.
5. **Atraso**: no sandbox altere o vencimento de uma cobrança para ontem (ou espere o vencimento): evento `PAYMENT_OVERDUE`. Esperado: `assin.status = atrasada`, aviso e e-mail, plano e `f` NÃO mudam.
6. **Estorno**: na cobrança paga clique **Estornar**. Esperado: `plano = cortesia3m`, `f` vazio, aviso "Pagamento estornado" e e-mail para você.
7. **Cancelar**: em Minha conta > Cancelar assinatura. Esperado: `assin.status = cancelada`, plano continua até `f`.
8. **Evento repetido**: no painel do webhook do Asaas use "Reenviar evento": nada muda e a resposta é 200 (duplicado).
9. **Token errado**: em Integrações > Webhook troque o token por outro e dispare um evento: o painel mostra erro 401 (e nada é gravado). Volte o token certo.
10. **Chamado**: em Minha conta > Suporte abra um chamado: você recebe e-mail. Responda pela Central v5; o cliente recebe e-mail e aviso.
11. **Fundador / vagas**: o Fundador (R$ 59/mês ou R$ 590/ano, 3 computadores, suporte prioritário) vende até a data ou até as 100 vagas, o que vier primeiro. O **Profissional** (R$ 69/mês ou R$ 690/ano, 2 computadores) só passa a vender depois que o Fundador encerrar. **Planejar Empresas é sob consulta**: não vende pelo "assinar" (o programa devolve o motivo `sob_consulta`); você aplica o plano pela Central (5 computadores, extras até 10). O robô só diz "restam N vagas" quando restarem 30 ou menos. Chamados de conta Fundador ficam com `prioridade = true` para a Central mostrar primeiro. Veja `vagas/fundador` no Firestore: `usadas` sobe 1 na primeira confirmação do Fundador (crie o documento com `usadas 0`, `total 100`, `ate 2027-03-31` se quiser conferir ou alterar; sem o documento valem os valores de `planos.js`).
12. Erros: Firebase Console > Functions > Registros (logs) mostram qualquer falha; `eventos/{id}.estado = erro` indica evento que o Asaas vai reenviar sozinho.

## 10. Passar para PRODUÇÃO
1. No Asaas de produção gere a chave de API e cadastre o **mesmo** webhook (mesma URL e token).
2. `firebase functions:secrets:set ASAAS_API_KEY` (chave de produção) e `firebase functions:secrets:set ASAAS_AMBIENTE` → `producao`.
3. `firebase deploy --only functions`
4. Faça UMA compra real do plano Essencial (R$ 39, ver `planos.js`) no seu próprio cartão, confira tudo e estorne.

## Para mudar preços, planos, vagas e datas
Edite **só** o arquivo `planos.js` (preços, ciclos, computadores, módulos, vagas, datas, planos que deixam de vender com `ativo: false`, `depoisDe`, `sobConsulta`, `prioridade`), rode `npm test` e `firebase deploy --only functions`. Quem já assina mantém o valor da assinatura que já existe no Asaas.

## Limites conhecidos
- Troca de plano (`trocarPlano`) vale a partir do próximo pagamento (sem proporcional).
- Vaga do Fundador/lançamento é contada quando o 1º pagamento é confirmado (pode haver pequena folga se várias pessoas pagarem juntas).
- Não rodei nada contra o Asaas/Meta de verdade (o ambiente de desenvolvimento não tem internet); os testes usam dublês. O roteiro acima é a prova real.
