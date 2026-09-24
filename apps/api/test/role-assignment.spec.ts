import { ROLES, can, canAssignRole, canManageEmployee, type Role } from '@corpsol/shared';

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

describe('разделение создания и подтверждения оффера', () => {
  it('МОП заводит офферы, но не подтверждает их', () => {
    expect(can('MOP', 'offer.create')).toBe(true);
    // Принятый оффер закрывает план и влияет на премию. Если подтверждать
    // может тот, кому за это платят, контроль перестаёт быть контролем.
    expect(can('MOP', 'offer.confirm')).toBe(false);
  });

  it('подтверждает руководитель и выше', () => {
    expect(can('ROP', 'offer.confirm')).toBe(true);
    expect(can('DIRECTOR', 'offer.confirm')).toBe(true);
    expect(can('SUPER_ADMIN', 'offer.confirm')).toBe(true);
  });

  it('ЧР к сделкам отношения не имеет', () => {
    expect(can('HR', 'offer.confirm')).toBe(false);
    expect(can('HR', 'offer.create')).toBe(false);
  });
});
