// Background Service Worker
// content script와 popup 간 메시지 중계 및 데이터 관리

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WORKBOOK_LIST_DATA') {
    // 워크북 목록 데이터 저장
    chrome.storage.local.get(['workbooks'], (result) => {
      const existingWorkbooks = result.workbooks || {};
      message.workbooks.forEach(wb => {
        existingWorkbooks[wb.id] = {
          ...existingWorkbooks[wb.id],
          ...wb,
          updatedAt: new Date().toISOString()
        };
      });
      chrome.storage.local.set({ workbooks: existingWorkbooks });
    });
  } else if (message.type === 'WORKBOOK_DETAIL_DATA') {
    // 워크북 상세 데이터 저장
    console.log('BOJ Progression (background): 워크북 상세 데이터 수신:', message);
    console.log('BOJ Progression (background): 수신한 progress 값:', message.progress, typeof message.progress);
    
    chrome.storage.local.get(['workbooks'], (result) => {
      const workbooks = result.workbooks || {};
      const existing = workbooks[message.workbookId] || {};
      
      // progress 계산 - solvedProblems와 totalProblems가 있으면 항상 계산
      let progress = message.progress;
      if (typeof message.solvedProblems === 'number' && typeof message.totalProblems === 'number' && message.totalProblems > 0) {
        const calculatedProgress = Math.round((message.solvedProblems / message.totalProblems) * 100);
        // 전달된 progress가 없거나 0이면 계산된 값 사용
        if (progress === undefined || progress === null || progress === 0) {
          progress = calculatedProgress;
        } else {
          // 전달된 progress와 계산된 progress가 다르면 계산된 값 사용 (더 정확)
          if (Math.abs(progress - calculatedProgress) > 1) {
            console.log(`BOJ Progression (background): progress 불일치 감지. 전달된 값: ${progress}%, 계산된 값: ${calculatedProgress}%. 계산된 값 사용.`);
            progress = calculatedProgress;
          }
        }
      } else if (progress === undefined || progress === null) {
        // solvedProblems/totalProblems가 없고 progress도 없으면 기존 값 유지
        progress = existing.progress || 0;
      }
      
      // progress 값을 명시적으로 설정
      const workbookData = {
        id: message.workbookId,
        title: message.title || existing.title,
        totalProblems: message.totalProblems,
        solvedProblems: message.solvedProblems,
        problems: message.problems,
        progress: progress, // 계산된 progress 값 저장
        updatedAt: new Date().toISOString()
      };
      
      workbooks[message.workbookId] = workbookData;
      
      console.log('BOJ Progression (background): 저장할 데이터:', workbookData);
      console.log('BOJ Progression (background): 저장할 progress 값:', workbookData.progress);
      console.log('BOJ Progression (background): solvedProblems:', workbookData.solvedProblems, 'totalProblems:', workbookData.totalProblems);
      
      chrome.storage.local.set({ workbooks }, () => {
        if (chrome.runtime.lastError) {
          console.error('BOJ Progression (background): 저장 실패:', chrome.runtime.lastError);
        } else {
          console.log('BOJ Progression (background): 저장 완료 - progress:', workbookData.progress);
          
          // 저장 후 목록 페이지가 열려있으면 업데이트 요청
          chrome.tabs.query({ url: 'https://www.acmicpc.net/workbook/top' }, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_PROGRESS_BARS' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.log('BOJ Progression (background): 목록 페이지에 메시지 전송 실패 (페이지가 열려있지 않을 수 있음)');
                }
              });
            });
          });
        }
      });
    });
  } else if (message.type === 'CRAWL_WORKBOOK_DETAIL') {
    // 워크북 상세 페이지 크롤링 요청
    const workbookId = message.workbookId;
    console.log(`BOJ Progression (background): 워크북 #${workbookId} 크롤링 시작`);
    
    // 숨겨진 탭으로 워크북 상세 페이지 열기
    chrome.tabs.create({
      url: `https://www.acmicpc.net/workbook/view/${workbookId}`,
      active: false
    }, (tab) => {
      // 탭이 로드될 때까지 대기
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          
          // content script에 크롤링 요청
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'CRAWL_THIS_PAGE' }, (response) => {
              // 크롤링 완료 후 탭 닫기
              setTimeout(() => {
                chrome.tabs.remove(tab.id);
              }, 1000);
            });
          }, 2000);
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    sendResponse({ success: true });
  }
  
  return true;
});

