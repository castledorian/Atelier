import type { StudentAccount } from '../../server/types';

/** Ce que l'administrateur observe en ce moment (lecture seule). */
export type Watch =
  | { kind: 'teacher'; schoolId: string; schoolName: string }
  | { kind: 'class'; classId: string; label: string }
  | { kind: 'student'; studentId: string; name: string; label: string; account?: StudentAccount; /** observation d'où l'on vient (retour) */ back?: Watch };
