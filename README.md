# Planejar Obras — atualizações

Arquivos de atualização do **Planejar Obras** (Planejar Engenharia).

- `registro.json` — registro mensal assinado digitalmente (situação das licenças, tabelas de preço e versão do programa). O programa confere a assinatura antes de usar qualquer informação.
- `programa/` — versão atual do programa.
- `tabelas/` — tabelas de preço publicadas.

Para usar o programa é preciso uma conta ou licença emitida pela Planejar Engenharia.

## Instalar

Baixe **[Instalar Planejar Obras.exe](https://github.com/planejarengenharia/planejar-obras-atualizacoes/raw/main/programa/Instalar%20Planejar%20Obras.exe)** e dê dois cliques. Não precisa de administrador: o programa vai para a sua pasta de usuário e ganha atalhos na Área de Trabalho e no Menu Iniciar. Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

## Novidades da versão 3.6.10

- **Memória de cálculo da medição mais curta:** cada local da memória do contrato ocupa uma linha só, com o que foi medido nele agora (Nº, comprimento, largura, altura e parcial) ao lado do contrato, medido antes, acumulado, saldo e barra de avanço. Os locais medidos agora ficam em amarelo. Na obra de teste, a memória caiu de 17 para 7 páginas.

## Novidades da versão 3.6.9

- **Memória de cálculo da medição** volta ao modelo de sempre (Nº, comprimento, largura, altura e parcial), agora com o acompanhamento de cada item: contrato, medido antes, nesta medição, acumulado, saldo e barra do acumulado (medido antes em azul, nesta medição em amarelo).
- Embaixo de cada item sai o **saldo por linha da memória do contrato**: cada local com o total, o já medido, o desta medição, o acumulado e o saldo. O mesmo vale para a aba Memória do Excel da medição.

## Novidades da versão 3.6.8

- **Tela da medição:** o cabeçalho da tabela fica fixo ao rolar e mostra contrato (quantidade, preço e total com BDI), acumulado anterior, este período, acumulado atual com %, saldo contratual e a situação do item. Saiu o "prev." embaixo da porcentagem.
- **Boletim de medição completo:** preço unitário e total sem BDI e com BDI, quantidade realizada, movimento financeiro, saldo, realizado/contratado e situação do item, com as linhas Total sem BDI, B.D.I. e Total com BDI.
- **Resumo por etapa sem BDI**, com o BDI e o total com BDI, % realizado × previsto, desvio e indicadores.
- **Novo: cronograma físico-financeiro por medição** (histórico de todas as medições por etapa, realizado × previsto).
- **Pasta técnica num PDF só** (capa, resumo, boletim, memória, fotos e CFF) e **relatório final da obra** com o boletim e a memória de cálculo de cada medição.
- **Excel da medição** com as abas Resumo, Boletim, Memória e CFF.
- **Orçamento completo em Excel** (planilha orçamentária, custo direto, resumo, memória de cálculo, composições, composições próprias, curva ABC, cronograma, BDI e encargos sociais). É também o arquivo ORÇAMENTO do backup automático.

## Novidades da versão 3.6.7

- **Memória de cálculo da medição:** o botão **Aplicar quantidade** não fica mais escondido em telas menores.
- **Saldo por linha da memória do contrato:** ao abrir a memória de um serviço na medição, aparece cada local da memória do contrato com o total, o já medido, o que entra nesta medição e o saldo. O botão **Saldo** mede o que falta daquele local.

## Novidades da versão 3.6.6

- **Atualizações mais rápidas:** com internet, o programa confere uma vez por dia se há versão nova, tabelas novas e a situação da conta. A licença continua com a validação mensal: sem internet, nada muda até completar 30 dias.
- Se você clicar em "Depois" no aviso de versão nova, ele volta a aparecer na próxima vez que abrir o programa.

## Novidades da versão 3.6.5

- **Troca de computador sem complicação:** se a licença foi ativada em outro computador ou navegador, a tela Conta e licença mostra o botão **Pedir licença para este computador**. Ele manda pelo WhatsApp a sua conta e o código novo. A licença nova vem com o mesmo plano e a mesma validade.
- Inclui todas as correções da 3.6.4.

## Novidades da versão 3.6.4

- **Contas mais exatas:** arredondamento de centavos exato e BDI com 2 casas, igual ao impresso. Obras feitas antes continuam com os mesmos valores até você clicar em **Atualizar o cálculo** no orçamento (o programa mostra a diferença antes).
- **Quantidades com 3 ou mais casas** na medição e no orçamento (0,125 m³ não vira mais 0,13).
- **Aviso antes de quebrar o selo:** se uma alteração mexer numa medição fechada, o programa pergunta e oferece desfazer.
- **Aditivo novo vale a partir da próxima medição**, sem mexer nos boletins já fechados.
- O quadro **Dados do orçamento** fica aberto enquanto você preenche; **1.500** é lido como mil e quinhentos.
- Mais proteção ao importar arquivos de obra e de celular, e ao importar uma obra que já existe o programa pergunta se substitui ou cria uma cópia.

## Novidades da versão 3.6.3

- **Backup automático sem pedir autorização:** instale pelo instalador acima e escolha a pasta do backup uma última vez. O atalho "Planejar Obras" passa a abrir o programa junto com um ajudante que grava o backup sozinho (só no seu computador).
- **PIN opcional** para abrir o programa (Configurações e licença → PIN).
- Mais proteção da versão grátis.

## Novidades da versão 3.6.2

- **Painel da obra que se adapta à finalidade:** obra em execução (avanço, medições por mês, pontos de atenção, curva S) ou orçamento para licitação (referência × proposta, limite de exequibilidade de 75%, documentos do edital).
- **Orçamento mais transparente:** formação do preço (material, mão de obra e equipamento), origem de cada quantidade, últimas alterações e código de verificação no rodapé dos PDFs.
- **Cronograma em Gantt**, medição com etapas até o selo digital e régua do BDI na faixa do TCU.
- **Central de Relatórios**, com assinaturas que levam logo, empresa e CNPJ.
- **Até 5 perfis de uso**, cada um com as suas obras, e troca rápida da empresa que sai nos documentos.
- **Backup automático** que religa sozinho ao abrir o programa.

Para atualizar: abra o programa com internet e clique em **Atualizar** no aviso de versão nova, ou baixe o instalador acima. Suas obras e a sua licença continuam iguais.
