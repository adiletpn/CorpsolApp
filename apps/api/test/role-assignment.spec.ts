import { ROLES, canAssignRole, canManageEmployee, type Role } from '@corpsol/shared';

describe('правила выдачи ролей', () => {
  it('ЧР заводит только линейный персонал', () => {
    expect(canAssignRole('HR', 'MOP')).toBe(true);
    expect(canAssignRole('HR', 'ROP')).toBe(true);
  });

  it('ЧР не может создать супер-админа, директора или второго ЧР', () => {
    expect(canAssignRole('HR', 'SUPER_ADMIN')).toBe(false);
    expect(canAssignRole('HR', 'DIRECTOR')).toBe(false);
    // Иначе ЧР завёл бы «своего» ЧР и обошёл ограничение через него.
    expect(canAssignRole('HR', 'HR')).toBe(false);
  });

  it('супер-админ выдаёт любую роль', () => {
    for (const role of ROLES) {
      expect(canAssignRole('SUPER_ADMIN', role)).toBe(true);
    }
  });

  it('директор и руководители отделов сотрудников не заводят', () => {
    for (const actor of ['DIRECTOR', 'ROP', 'MOP'] as Role[]) {
      for (const target of ROLES) {
        expect(canAssignRole(actor, target)).toBe(false);
      }
    }
  });

  it('ЧР не может уволить директора или супер-админа', () => {
    expect(canManageEmployee('HR', 'DIRECTOR')).toBe(false);
    expect(canManageEmployee('HR', 'SUPER_ADMIN')).toBe(false);
    expect(canManageEmployee('HR', 'MOP')).toBe(true);
  });

  it('ни одна роль, кроме супер-админа, не может повысить до своего уровня или выше', () => {
    for (const actor of ROLES) {
      if (actor === 'SUPER_ADMIN') continue;
      expect(canAssignRole(actor, actor)).toBe(false);
      expect(canAssignRole(actor, 'SUPER_ADMIN')).toBe(false);
    }
  });
});
