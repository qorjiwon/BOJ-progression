// DOM 요소
const defaultLanguageSelect = document.getElementById('defaultLanguage');
const saveLanguageBtn = document.getElementById('saveLanguageBtn');
const saveMessage = document.getElementById('saveMessage');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await loadDefaultLanguage();
  
  // 언어 설정 저장 버튼
  saveLanguageBtn.addEventListener('click', saveDefaultLanguage);
});

// 기본 언어 로드
async function loadDefaultLanguage() {
  const result = await chrome.storage.local.get(['defaultLanguage']);
  if (result.defaultLanguage) {
    defaultLanguageSelect.value = result.defaultLanguage;
  }
}

// 기본 언어 저장
async function saveDefaultLanguage() {
  const languageValue = defaultLanguageSelect.value;
  await chrome.storage.local.set({ defaultLanguage: languageValue });
  
  saveMessage.textContent = '저장되었습니다!';
  saveMessage.style.color = '#28a745';
  
  setTimeout(() => {
    saveMessage.textContent = '';
  }, 2000);
}

