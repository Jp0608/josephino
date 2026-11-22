import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Termos de uso" };

export default function Terms() {
  return (
    <LegalPage title="Termos de uso">
      <p>O Ondaro é uma plataforma de gestão para empresas e profissionais de manutenção de piscinas. Ao criar uma conta, você declara ter poderes para contratar em nome da empresa cadastrada.</p>
      <h2>Responsabilidade técnica</h2>
      <p>O Ondaro registra e organiza informações informadas pelos usuários (medições, produtos aplicados, procedimentos). Ele não define faixas técnicas, não recomenda dosagens e não atesta que uma piscina está liberada para uso. A responsabilidade técnica pelo serviço é da empresa e dos profissionais que o executam.</p>
      <h2>Seus dados</h2>
      <p>Os dados cadastrados pertencem à sua empresa. Você pode exportá-los a qualquer momento em Plano e assinatura. Os dados de cada empresa ficam isolados e não são compartilhados com outras empresas.</p>
      <h2>Teste grátis e planos</h2>
      <p>O teste grátis não exige cartão. Ao final, sem assinatura ativa, a conta entra em modo de consulta: nada é apagado, mas não é possível registrar novos dados até a contratação de um plano.</p>
      <h2>Integrações</h2>
      <p>Envios por WhatsApp, e-mail e cobranças dependem de integrações de terceiros. Enquanto não estiverem conectadas, o sistema indica claramente o estado de cada mensagem ou cobrança.</p>
      <h2>Contato</h2>
      <p>Dúvidas sobre estes termos: canal de suporte informado na sua conta.</p>
    </LegalPage>
  );
}
