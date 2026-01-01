// 워크북 데이터 관리
let workbooks = {};

// DOM 요소
const workbookListEl = document.getElementById('workbookList');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await loadWorkbooks();
  renderWorkbookList();
  
  // 현재 탭에서 데이터 새로고침
  refreshCurrentTabData();
});

// 워크북 데이터 로드
async function loadWorkbooks() {
  const result = await chrome.storage.local.get(['workbooks']);
  workbooks = result.workbooks || {};
}

// 현재 탭에서 데이터 새로고침
async function refreshCurrentTabData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('acmicpc.net')) {
      chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        setTimeout(async () => {
          await loadWorkbooks();
          renderWorkbookList();
        }, 500);
      });
    }
  } catch (error) {
    console.error('Error refreshing data:', error);
  }
}

// 워크북 목록 렌더링
function renderWorkbookList() {
  const workbookArray = Object.values(workbooks);
  
  if (workbookArray.length === 0) {
    workbookListEl.innerHTML = '<p class="empty-message">워크북 정보가 없습니다.<br>백준 워크북 페이지를 방문해주세요.</p>';
    return;
  }
  
  workbookListEl.innerHTML = workbookArray
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map(workbook => {
      const progress = workbook.progress || (workbook.totalProblems > 0 
        ? Math.round((workbook.solvedProblems / workbook.totalProblems) * 100) 
        : 0);
      const solvedText = workbook.solvedProblems !== undefined 
        ? `${workbook.solvedProblems}/${workbook.totalProblems}` 
        : (workbook.progress ? `${workbook.progress}%` : '-');
      
      return `
        <div class="workbook-item">
          <div class="workbook-info">
            <div class="workbook-title">${workbook.title || `워크북 #${workbook.id}`}</div>
            <div class="workbook-progress">
              <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progress}%"></div>
              </div>
              <div class="progress-text">${solvedText}</div>
            </div>
          </div>
          <div class="workbook-actions">
            <a href="https://www.acmicpc.net/workbook/view/${workbook.id}" target="_blank" class="icon-btn" title="워크북 열기">🔗</a>
          </div>
        </div>
      `;
    }).join('');
}

