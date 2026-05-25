const roles = {
  관리자: ["전체 멤버 보기", "멤버 추가/수정", "출석 수정", "권한 관리", "민감 정보 열람"],
  리더: ["담당 소그룹 보기", "출석 체크", "돌봄 메모 작성"],
  스태프: ["전체 출석 보기", "일반 연락처 열람", "보고서 다운로드"],
  멤버: ["본인 정보 보기", "소그룹 정보 보기"],
};

const groups = [
  { name: "믿음 1", leader: "박서준", target: 12 },
  { name: "소망 2", leader: "이예린", target: 10 },
  { name: "사랑 3", leader: "최도윤", target: 12 },
  { name: "청년부 A", leader: "정민재", target: 14 },
  { name: "새가족", leader: "한지우", target: 8 },
];

let members = [
  {
    id: 1,
    name: "김하은",
    phone: "010-2145-7301",
    group: "믿음 1",
    role: "리더",
    status: "활동",
    email: "haeun.kim@example.com",
    address: "서울시 마포구",
    baptism: "세례",
    notes: "다음 달 소그룹 리더 훈련 참석 예정",
    care: "리더 후보",
    present: true,
  },
  {
    id: 2,
    name: "박서준",
    phone: "010-7712-1185",
    group: "믿음 1",
    role: "리더",
    status: "활동",
    email: "seojoon.park@example.com",
    address: "서울시 서대문구",
    baptism: "입교",
    notes: "주중 심방 가능",
    care: "소그룹 리더",
    present: true,
  },
  {
    id: 3,
    name: "이예린",
    phone: "010-9038-4521",
    group: "소망 2",
    role: "스태프",
    status: "활동",
    email: "yerin.lee@example.com",
    address: "경기도 고양시",
    baptism: "세례",
    notes: "찬양팀 섬김",
    care: "팀 사역",
    present: false,
  },
  {
    id: 4,
    name: "최도윤",
    phone: "010-5820-3904",
    group: "사랑 3",
    role: "리더",
    status: "돌봄 필요",
    email: "doyoon.choi@example.com",
    address: "서울시 은평구",
    baptism: "미확인",
    notes: "최근 3주 결석. 리더가 연락 예정",
    care: "결석 확인",
    present: false,
  },
  {
    id: 5,
    name: "정민재",
    phone: "010-4482-9300",
    group: "청년부 A",
    role: "관리자",
    status: "활동",
    email: "minjae.jung@example.com",
    address: "서울시 용산구",
    baptism: "세례",
    notes: "전체 운영 담당",
    care: "운영자",
    present: true,
  },
  {
    id: 6,
    name: "한지우",
    phone: "010-6304-8712",
    group: "새가족",
    role: "리더",
    status: "새가족",
    email: "jiwoo.han@example.com",
    address: "서울시 강서구",
    baptism: "미정",
    notes: "새가족 4주 과정 2주차",
    care: "새가족",
    present: true,
  },
  {
    id: 7,
    name: "윤서아",
    phone: "010-3290-7744",
    group: "소망 2",
    role: "멤버",
    status: "활동",
    email: "seoa.yoon@example.com",
    address: "서울시 중구",
    baptism: "세례",
    notes: "소그룹 회계 섬김",
    care: "정착",
    present: true,
  },
  {
    id: 8,
    name: "오준호",
    phone: "010-8122-6509",
    group: "사랑 3",
    role: "멤버",
    status: "돌봄 필요",
    email: "junho.oh@example.com",
    address: "경기도 부천시",
    baptism: "미확인",
    notes: "개인 일정으로 예배 참석 불규칙",
    care: "출석 돌봄",
    present: false,
  },
];

let selectedMemberId = members[0].id;
let attendanceFilter = "all";

const pages = {
  dashboard: "대시보드",
  members: "멤버",
  groups: "소그룹",
  attendance: "출석",
  permissions: "권한",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function filteredMembers() {
  const query = $("#memberSearch").value.trim().toLowerCase();
  if (!query) return members;
  return members.filter((member) =>
    [member.name, member.phone, member.group, member.role, member.status]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function attendanceMembers() {
  if (attendanceFilter === "present") return members.filter((member) => member.present);
  if (attendanceFilter === "absent") return members.filter((member) => !member.present);
  return members;
}

function renderDashboard() {
  const presentCount = members.filter((member) => member.present).length;
  const attendanceRate = Math.round((presentCount / members.length) * 100);

  $("#totalMembers").textContent = members.length;
  $("#weeklyAttendance").textContent = `${attendanceRate}%`;
  $("#weeklyAttendanceDetail").textContent = `${presentCount}/${members.length}명 출석`;
  $("#groupCount").textContent = groups.length;
  $("#roleCount").textContent = Object.keys(roles).length;

  $("#careList").innerHTML = members
    .filter((member) => member.status !== "활동" || member.care.includes("리더"))
    .map(
      (member) => `
        <article class="care-item">
          <div class="person-block">
            <strong>${member.name}</strong>
            <span>${member.group} · ${member.notes}</span>
          </div>
          <span class="status-pill ${member.status === "활동" ? "active" : ""}">${member.status}</span>
        </article>
      `,
    )
    .join("");

  $("#groupSummary").innerHTML = groups
    .map((group) => {
      const groupMembers = members.filter((member) => member.group === group.name);
      const present = groupMembers.filter((member) => member.present).length;
      const rate = groupMembers.length ? Math.round((present / groupMembers.length) * 100) : 0;
      return `
        <article class="summary-row">
          <div class="person-block">
            <strong>${group.name}</strong>
            <span>리더 ${group.leader} · ${groupMembers.length}/${group.target}명</span>
          </div>
          <span class="attendance-pill ${rate >= 70 ? "present" : ""}">${rate}%</span>
        </article>
      `;
    })
    .join("");
}

function renderMembers() {
  const list = filteredMembers();
  $("#memberListCount").textContent = `${list.length}명`;
  $("#memberRows").innerHTML = list
    .map(
      (member) => `
        <tr data-member-id="${member.id}" class="${member.id === selectedMemberId ? "selected" : ""}">
          <td><strong>${member.name}</strong><div class="meta">${member.email}</div></td>
          <td>${member.group}</td>
          <td><span class="role-pill">${member.role}</span></td>
          <td><span class="status-pill ${member.status === "활동" ? "active" : ""}">${member.status}</span></td>
          <td>${member.phone}</td>
        </tr>
      `,
    )
    .join("");

  $$("#memberRows tr").forEach((row) => {
    row.addEventListener("click", () => {
      selectedMemberId = Number(row.dataset.memberId);
      renderMembers();
      renderMemberDetail();
    });
  });
}

function renderMemberDetail() {
  const member = members.find((item) => item.id === selectedMemberId) || members[0];
  $("#selectedMemberStatus").textContent = member.status;
  $("#memberDetail").innerHTML = `
    <div class="detail-row">
      <span class="detail-label">이름</span>
      <strong>${member.name}</strong>
    </div>
    <div class="detail-row">
      <span class="detail-label">연락처</span>
      <strong>${member.phone}</strong>
    </div>
    <div class="detail-row">
      <span class="detail-label">주소</span>
      <strong>${member.address}</strong>
    </div>
    <div class="detail-row">
      <span class="detail-label">세례/등록</span>
      <strong>${member.baptism}</strong>
    </div>
    <div class="detail-row">
      <span class="detail-label">커스텀 메모</span>
      <strong>${member.notes}</strong>
    </div>
  `;
}

function renderGroups() {
  $("#groupCards").innerHTML = groups
    .map((group) => {
      const groupMembers = members.filter((member) => member.group === group.name);
      const fill = Math.min(Math.round((groupMembers.length / group.target) * 100), 100);
      const present = groupMembers.filter((member) => member.present).length;
      return `
        <article class="group-card">
          <header>
            <div>
              <h2>${group.name}</h2>
              <p class="meta">리더 ${group.leader}</p>
            </div>
            <span class="role-pill">${groupMembers.length}명</span>
          </header>
          <div>
            <div class="progress" aria-label="${group.name} 목표 인원 대비 ${fill}%">
              <span style="width: ${fill}%"></span>
            </div>
            <p class="meta">목표 ${group.target}명 · 이번 주 출석 ${present}명</p>
          </div>
          <div class="care-list">
            ${groupMembers
              .map(
                (member) => `
                  <div class="summary-row">
                    <span>${member.name}</span>
                    <span class="attendance-pill ${member.present ? "present" : ""}">
                      ${member.present ? "출석" : "미출석"}
                    </span>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAttendance() {
  $("#attendanceList").innerHTML = attendanceMembers()
    .map(
      (member) => `
        <article class="attendance-row">
          <div class="person-block">
            <strong>${member.name}</strong>
            <span>${member.group} · ${member.phone}</span>
          </div>
          <span class="attendance-pill ${member.present ? "present" : ""}">
            ${member.present ? "출석" : "미출석"}
          </span>
          <button class="${member.present ? "secondary-button" : "primary-button"}" data-toggle-attendance="${member.id}" type="button">
            ${member.present ? "미출석 처리" : "출석 체크"}
          </button>
        </article>
      `,
    )
    .join("");

  $$("[data-toggle-attendance]").forEach((button) => {
    button.addEventListener("click", () => {
      const member = members.find((item) => item.id === Number(button.dataset.toggleAttendance));
      member.present = !member.present;
      renderAll();
    });
  });
}

function renderPermissions() {
  $("#permissionMatrix").innerHTML = Object.entries(roles)
    .map(
      ([role, permissions]) => `
        <article class="permission-row">
          <div class="person-block">
            <strong>${role}</strong>
            <span>${members.filter((member) => member.role === role).length}명 배정</span>
          </div>
          <div class="permission-list">
            ${permissions.map((permission) => `<span class="permission-chip">${permission}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderSelectors() {
  $("#groupSelect").innerHTML = groups
    .map((group) => `<option value="${group.name}">${group.name}</option>`)
    .join("");
  $("#roleSelect").innerHTML = Object.keys(roles)
    .map((role) => `<option value="${role}">${role}</option>`)
    .join("");
}

function renderAll() {
  renderDashboard();
  renderMembers();
  renderMemberDetail();
  renderGroups();
  renderAttendance();
  renderPermissions();
}

function switchSection(sectionId) {
  $$(".section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.section === sectionId));
  $("#pageTitle").textContent = pages[sectionId];
}

function setupEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchSection(button.dataset.section));
  });

  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      attendanceFilter = button.dataset.attendanceFilter;
      $$(".segment").forEach((item) => item.classList.toggle("active", item === button));
      renderAttendance();
    });
  });

  $("#memberSearch").addEventListener("input", renderMembers);

  $("#addMemberShortcut").addEventListener("click", () => {
    switchSection("members");
    $("#addMemberPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#loginButton").addEventListener("click", () => {
    $("#loginState").textContent = "구글 OAuth 연결 지점입니다. 운영 배포 때 실제 로그인으로 교체합니다.";
  });

  $("#memberForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name").toString().trim();
    const phone = formData.get("phone").toString().trim();
    const group = formData.get("group").toString();
    const role = formData.get("role").toString();
    const status = formData.get("status").toString();

    const newMember = {
      id: Date.now(),
      name,
      phone,
      group,
      role,
      status,
      email: `${name.replace(/\s/g, "").toLowerCase()}@example.com`,
      address: "미입력",
      baptism: "미입력",
      notes: "추가 정보 입력 필요",
      care: status,
      present: false,
    };

    members = [...members, newMember];
    selectedMemberId = newMember.id;
    event.currentTarget.reset();
    renderAll();
  });
}

renderSelectors();
setupEvents();
renderAll();
