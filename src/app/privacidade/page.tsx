import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Política de privacidade" };

export default function Privacy() {
  return (
    <LegalPage title="Política de privacidade (LGPD)">
      <p>Esta política explica como o Ondaro trata dados pessoais, em conformidade com a Lei nº 13.709/2018 (LGPD).</p>
      <h2>Papéis</h2>
      <p>Para os dados dos clientes finais (nome, telefone, endereço, piscinas), a empresa de manutenção é a controladora e o Ondaro atua como operador, tratando os dados apenas para prestar o serviço contratado. Para os dados de cadastro dos usuários da plataforma, o Ondaro é o controlador.</p>
      <h2>Dados tratados</h2>
      <p>Dados de cadastro de usuários (nome, e-mail, telefone), dados de clientes informados pela empresa, registros técnicos das visitas, fotos, dados financeiros lançados e registros de acesso (data, IP e navegador) para segurança e auditoria.</p>
      <h2>Finalidades e bases legais</h2>
      <p>Execução do contrato com a empresa, cumprimento de obrigações legais, segurança (legítimo interesse) e, para envio de mensagens por WhatsApp ao cliente final, o consentimento registrado pela empresa.</p>
      <h2>Segurança</h2>
      <p>Senhas com hash, sessões revogáveis, isolamento de dados por empresa no banco de dados, acesso por permissões e registro de auditoria das alterações relevantes. Links de relatório e do portal são privados e podem ser revogados.</p>
      <h2>Direitos do titular</h2>
      <p>Acesso, correção, portabilidade e eliminação, observadas as obrigações legais de guarda. O cliente final deve falar primeiro com a empresa que presta o serviço.</p>
      <h2>Retenção</h2>
      <p>Os dados são mantidos enquanto a conta estiver ativa e pelo prazo necessário a obrigações legais. Após o encerramento, a empresa pode exportar seus dados antes da exclusão.</p>
    </LegalPage>
  );
}
