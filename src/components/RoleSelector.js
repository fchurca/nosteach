const ROLES_KEY = 'nosteach_roles';

const DEFAULT_ROLES = {
  teacher: false,
  student: false,
  sponsor: false
};

class RoleSelector {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.roles = this.loadRoles();
    this.render();
  }

  loadRoles() {
    try {
      const saved = localStorage.getItem(ROLES_KEY);
      if (saved) {
        return { ...DEFAULT_ROLES, ...JSON.parse(saved) };
      }
    } catch (err) {
      console.warn('Error loading roles:', err);
    }
    return { ...DEFAULT_ROLES };
  }

  saveRoles() {
    localStorage.setItem(ROLES_KEY, JSON.stringify(this.roles));
  }

  setRole(role, value) {
    if (role in this.roles) {
      this.roles[role] = value;
      this.saveRoles();
      this.updateCheckboxes();
      if (this.onChange) {
        this.onChange(this.roles);
      }
    }
  }

  getRoles() {
    return { ...this.roles };
  }

  render() {
    if (!this.container) return;

    const { teacher, student, sponsor } = this.roles;

    this.container.innerHTML = `
      <div class="role-selector" style="
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        padding: 10px;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        margin-bottom: 15px;
      ">
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" id="role-teacher" ${teacher ? 'checked' : ''}>
          <span style="font-size: 1.2em;">👨‍🏫</span>
          <span>Profesor</span>
        </label>
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" id="role-student" ${student ? 'checked' : ''}>
          <span style="font-size: 1.2em;">📚</span>
          <span>Alumno</span>
        </label>
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" id="role-sponsor" ${sponsor ? 'checked' : ''}>
          <span style="font-size: 1.2em;">💰</span>
          <span>Patrocinador</span>
        </label>
      </div>
    `;

    this.attachListeners();
  }

  attachListeners() {
    const teacherCb = document.getElementById('role-teacher');
    const studentCb = document.getElementById('role-student');
    const sponsorCb = document.getElementById('role-sponsor');

    if (teacherCb) {
      teacherCb.addEventListener('change', (e) => this.setRole('teacher', e.target.checked));
    }
    if (studentCb) {
      studentCb.addEventListener('change', (e) => this.setRole('student', e.target.checked));
    }
    if (sponsorCb) {
      sponsorCb.addEventListener('change', (e) => this.setRole('sponsor', e.target.checked));
    }
  }

  updateCheckboxes() {
    const teacherCb = document.getElementById('role-teacher');
    const studentCb = document.getElementById('role-student');
    const sponsorCb = document.getElementById('role-sponsor');

    if (teacherCb) teacherCb.checked = this.roles.teacher;
    if (studentCb) studentCb.checked = this.roles.student;
    if (sponsorCb) sponsorCb.checked = this.roles.sponsor;
  }
}

export default RoleSelector;
export { ROLES_KEY, DEFAULT_ROLES };
