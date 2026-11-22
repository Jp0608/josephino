/** Erro com mensagem que pode ser mostrada ao usuário. Outros erros viram mensagem genérica. */
export class UserError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
  }
}
export class ForbiddenError extends UserError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message, "forbidden");
  }
}
export class NotFoundError extends UserError {
  constructor(message = "Registro não encontrado.") {
    super(message, "not_found");
  }
}
