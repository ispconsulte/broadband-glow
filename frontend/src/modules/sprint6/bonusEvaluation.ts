export type BonusPermissionRole = "admin" | "gestor" | "consultor";
export type BonusSeniority = "junior" | "pleno" | "senior" | null;
export type BonusEvaluationCategory = "hard_skill_manual" | "soft_skill" | "people_skill";
export type BonusEvaluationStatus = "draft" | "submitted";

const normalizeBonusPersonName = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const BONUS_INELIGIBLE_CONSULTANT_NAMES = new Set([
  normalizeBonusPersonName("Jaciara Bonicenha"),
  normalizeBonusPersonName("Renato Moura"),
]);

export type BonusEvaluationSubtopicDefinition = {
  key: string;
  label: string;
  description: string;
};

export const BONUS_PAYOUT_BY_SENIORITY: Record<Exclude<BonusSeniority, null>, number> = {
  junior: 1000,
  pleno: 2000,
  senior: 3500,
};

export const BONUS_MANUAL_WEIGHTS = {
  hardAuto: 0.25,
  hardManual: 0.25,
  softSkill: 0.3,
  peopleSkill: 0.2,
} as const;

export const BONUS_EVALUATION_CATEGORIES: Record<
  BonusEvaluationCategory,
  {
    label: string;
    payoutPerPoint: number;
    maxPayout: number;
    subtopics: BonusEvaluationSubtopicDefinition[];
  }
> = {
  hard_skill_manual: {
    label: "Hard Skill Manual",
    payoutPerPoint: 2.5,
    maxPayout: 250,
    subtopics: [
      {
        key: "qualidade_tecnica",
        label: "Qualidade técnica",
        description: "Qualidade técnica das entregas",
      },
      {
        key: "conformidade_documental",
        label: "Conformidade documental",
        description: "Conformidade com documentação exigida",
      },
      {
        key: "organizacao_evidencias",
        label: "Organização de evidências",
        description: "Organização de evidências nos projetos",
      },
    ],
  },
  soft_skill: {
    label: "Soft Skills",
    payoutPerPoint: 3,
    maxPayout: 300,
    subtopics: [
      {
        key: "organizacao",
        label: "Organização",
        description: "Organização pessoal e gestão de tarefas",
      },
      {
        key: "proatividade",
        label: "Proatividade",
        description: "Proatividade e antecipação de problemas",
      },
      {
        key: "comunicacao",
        label: "Comunicação",
        description: "Comunicação com equipe e clientes",
      },
      {
        key: "responsabilidade",
        label: "Responsabilidade",
        description: "Responsabilidade com prazos e compromissos",
      },
    ],
  },
  people_skill: {
    label: "People Skills",
    payoutPerPoint: 2,
    maxPayout: 200,
    subtopics: [
      {
        key: "trabalho_equipe",
        label: "Trabalho em equipe",
        description: "Colaboração e trabalho em equipe",
      },
      {
        key: "relacionamento_cliente",
        label: "Relacionamento com cliente",
        description: "Qualidade do relacionamento com clientes",
      },
      {
        key: "receptividade_feedback",
        label: "Receptividade a feedback",
        description: "Receptividade a feedbacks e críticas",
      },
    ],
  },
};

export function normalizeBonusRole(value?: string | null): BonusPermissionRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "admin" || role === "administrador") return "admin";
  if (role === "gestor" || role === "gerente" || role === "coordenador") return "gestor";
  return "consultor";
}

export function normalizeBonusSeniority(value?: string | null): BonusSeniority {
  const seniority = String(value ?? "").trim().toLowerCase();
  if (seniority === "junior") return "junior";
  if (seniority === "pleno") return "pleno";
  if (seniority === "senior" || seniority === "sênior") return "senior";
  return null;
}

export function isBonusEligibleConsultant(name?: string | null) {
  const normalized = normalizeBonusPersonName(name);
  if (!normalized) return true;
  return !BONUS_INELIGIBLE_CONSULTANT_NAMES.has(normalized);
}

export function getBonusCeiling(seniority?: string | null) {
  const normalized = normalizeBonusSeniority(seniority);
  return normalized ? BONUS_PAYOUT_BY_SENIORITY[normalized] : 1200;
}

export function score1To10To100(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) return null;
  return Math.max(0, Math.min(100, score * 10));
}

export function averageNumbers(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}
