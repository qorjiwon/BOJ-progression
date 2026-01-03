// 백준 사이트에서 실행되는 콘텐츠 스크립트
// 워크북 진행률 및 문제 해결 상태 추적

(function() {
  'use strict';
  
  // 워크북 ID 추출
  function extractWorkbookId() {
    const match = window.location.pathname.match(/\/workbook\/view\/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }
    return null;
  }
  
  // 워크북 상세 페이지 HTML에서 문제 목록 크롤링
  function parseWorkbookDetail(html, workbookId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 워크북 제목 추출
    let workbookTitle = '';
    const titleElement = doc.querySelector('h1, .page-header, .workbook-title');
    if (titleElement) {
      workbookTitle = titleElement.textContent.trim();
    }
    
    const table = doc.querySelector('table.table tbody');
    if (!table) return null;
    
    const rows = table.querySelectorAll('tr');
    let totalProblems = 0;
    let solvedProblems = 0;
    const problems = [];
    
    rows.forEach(row => {
      const problemCell = row.querySelector('td:first-child');
      const titleCell = row.querySelector('td:nth-child(2)');
      const statusCell = row.querySelector('td:nth-child(3)');
      
      if (problemCell && titleCell) {
        const problemNumber = parseInt(problemCell.textContent.trim());
        const titleLink = titleCell.querySelector('a');
        const problemTitle = titleLink ? titleLink.textContent.trim() : '';
        const isSolved = statusCell && statusCell.querySelector('.problem-label-ac') !== null;
        
        totalProblems++;
        if (isSolved) {
          solvedProblems++;
        }
        
        problems.push({
          number: problemNumber,
          title: problemTitle,
          solved: isSolved
        });
      }
    });
    
    if (totalProblems > 0) {
      const progressPercent = Math.round((solvedProblems / totalProblems) * 100);
      
      return {
        workbookId: workbookId,
        title: workbookTitle,
        totalProblems: totalProblems,
        solvedProblems: solvedProblems,
        problems: problems,
        progress: progressPercent
      };
    }
    
    return null;
  }
  
  // 워크북 상세 페이지 크롤링 요청 (background에서 처리)
  function crawlWorkbookDetail(workbookId) {
    chrome.runtime.sendMessage({
      type: 'CRAWL_WORKBOOK_DETAIL',
      workbookId: workbookId
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`BOJ Progression: 워크북 #${workbookId} 크롤링 요청 실패:`, chrome.runtime.lastError);
      }
    });
  }
  
  // 워크북들을 순차적으로 크롤링
  function crawlWorkbooksSequentially(workbookIds, index) {
    if (index >= workbookIds.length) {
      console.log('BOJ Progression: 모든 워크북 크롤링 요청 완료');
      // 크롤링 완료 후 progress-bar 업데이트 (약간의 지연 후)
      setTimeout(() => {
        updateAllWorkbookProgressBars();
      }, 5000);
      return;
    }
    
    const workbookId = workbookIds[index];
    console.log(`BOJ Progression: 워크북 #${workbookId} 크롤링 요청... (${index + 1}/${workbookIds.length})`);
    
    crawlWorkbookDetail(workbookId);
    
    // 다음 워크북 크롤링 (3초 지연 - 탭이 닫힐 시간을 줌)
    setTimeout(() => {
      crawlWorkbooksSequentially(workbookIds, index + 1);
    }, 3000);
  }
  
  // 워크북 목록 페이지에서 진행률 크롤링 및 자동 상세 페이지 크롤링
  async function crawlWorkbookList() {
    const table = document.querySelector('table.table.table-striped.table-bordered');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    const workbooks = [];
    const workbookIds = [];
    
    // 먼저 목록에서 기본 정보 수집
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;
      
      const workbookIdCell = cells[0];
      const titleCell = cells[2];
      const progressCell = cells[3];
      
      if (workbookIdCell && titleCell && progressCell) {
        const workbookId = parseInt(workbookIdCell.textContent.trim());
        const titleLink = titleCell.querySelector('a[href^="/workbook/view/"]');
        const progressBar = progressCell.querySelector('.progress-bar');
        
        if (workbookId && titleLink && progressBar) {
          const title = titleLink.textContent.trim();
          const progressWidth = progressBar.style.width;
          const progressPercent = parseFloat(progressWidth.replace('%', '')) || 0;
          
          workbooks.push({
            id: workbookId,
            title: title,
            progress: progressPercent
          });
          
          workbookIds.push(workbookId);
        }
      }
    });
    
    if (workbooks.length > 0) {
      console.log('BOJ Progression: 워크북 목록 크롤링 완료', workbooks.length, '개');
      
      // 목록 데이터 저장
      chrome.runtime.sendMessage({
        type: 'WORKBOOK_LIST_DATA',
        workbooks: workbooks
      });
      
      // 저장된 데이터 확인 후 없는 것만 크롤링
      chrome.storage.local.get(['workbooks'], (result) => {
        const existingWorkbooks = result.workbooks || {};
        const workbooksToCrawl = [];
        
        workbookIds.forEach(workbookId => {
          const existing = existingWorkbooks[workbookId];
          
          // 데이터가 없거나, progress가 0이고 solvedProblems가 없으면 크롤링 필요
          const needsCrawl = !existing || 
            (existing.progress === 0 && existing.solvedProblems === undefined) ||
            (existing.updatedAt && (() => {
              const updatedAt = new Date(existing.updatedAt);
              const now = new Date();
              const hoursDiff = (now - updatedAt) / (1000 * 60 * 60);
              return hoursDiff >= 24; // 24시간 이상 지난 데이터는 다시 크롤링
            })());
          
          if (needsCrawl) {
            workbooksToCrawl.push(workbookId);
          } else {
            console.log(`BOJ Progression: 워크북 #${workbookId} 최근 데이터 있음, 스킵`);
          }
        });
        
        // 크롤링할 워크북이 있으면 순차적으로 크롤링
        if (workbooksToCrawl.length > 0) {
          console.log(`BOJ Progression: ${workbooksToCrawl.length}개 워크북 크롤링 시작...`);
          crawlWorkbooksSequentially(workbooksToCrawl, 0);
        }
        
        // 초기 progress-bar 업데이트 (저장된 데이터로)
        updateAllWorkbookProgressBars();
      });
    }
  }
  
  // progress-bar에 텍스트 추가/업데이트
  function updateProgressBarWithText(progressCell, progressPercent, solvedProblems, totalProblems) {
    const progressDiv = progressCell.querySelector('.progress');
    if (!progressDiv) return;
    
    const progressBar = progressDiv.querySelector('.progress-bar');
    if (!progressBar) return;
    
    // progress-bar width 업데이트
    progressBar.style.width = `${progressPercent}%`;
    
    // 기존 텍스트 요소 제거
    const existingText = progressDiv.querySelector('.boj-progression-text');
    if (existingText) {
      existingText.remove();
    }
    
    // 텍스트 표시
    if (solvedProblems !== undefined && totalProblems !== undefined) {
      const textElement = document.createElement('div');
      textElement.className = 'boj-progression-text';
      textElement.textContent = `${solvedProblems}/${totalProblems} (${progressPercent}%)`;
      textElement.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 12px;
        font-weight: 600;
        color: #333;
        z-index: 10;
        pointer-events: none;
        white-space: nowrap;
        text-shadow: 0 0 2px rgba(255, 255, 255, 0.8);
      `;
      
      if (getComputedStyle(progressDiv).position === 'static') {
        progressDiv.style.position = 'relative';
      }
      
      progressDiv.appendChild(textElement);
    } else if (progressPercent > 0) {
      const textElement = document.createElement('div');
      textElement.className = 'boj-progression-text';
      textElement.textContent = `${progressPercent}%`;
      textElement.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 12px;
        font-weight: 600;
        color: #333;
        z-index: 10;
        pointer-events: none;
        white-space: nowrap;
        text-shadow: 0 0 2px rgba(255, 255, 255, 0.8);
      `;
      
      if (getComputedStyle(progressDiv).position === 'static') {
        progressDiv.style.position = 'relative';
      }
      
      progressDiv.appendChild(textElement);
    }
  }
  
  // 워크북 목록 페이지에서 저장된 데이터로 progress-bar 업데이트
  function updateAllWorkbookProgressBars() {
    // /workbook/top 또는 /workbook/top/숫자 페이지에서만 작동
    const path = window.location.pathname;
    if (!path.match(/^\/workbook\/top(\/\d+)?$/)) return;
    
    chrome.storage.local.get(['workbooks'], (result) => {
      const workbooks = result.workbooks || {};
      console.log('BOJ Progression: 저장된 워크북 데이터로 progress-bar 업데이트 시작');
      console.log('BOJ Progression: 저장된 워크북 개수:', Object.keys(workbooks).length);
      
      // 저장된 데이터 검증 및 수정
      let needsUpdate = false;
      const updatedWorkbooks = { ...workbooks };
      
      Object.keys(updatedWorkbooks).forEach(wbId => {
        const wb = updatedWorkbooks[wbId];
        // solvedProblems와 totalProblems가 있는데 progress가 없거나 0이면 계산해서 저장
        if (typeof wb.solvedProblems === 'number' && typeof wb.totalProblems === 'number' && wb.totalProblems > 0) {
          const calculatedProgress = Math.round((wb.solvedProblems / wb.totalProblems) * 100);
          if (wb.progress === undefined || wb.progress === null || wb.progress === 0) {
            console.log(`BOJ Progression: 워크북 #${wbId} progress 누락/0 감지, 계산하여 저장: ${calculatedProgress}%`);
            updatedWorkbooks[wbId].progress = calculatedProgress;
            needsUpdate = true;
          }
        }
      });
      
      // 수정된 데이터가 있으면 저장
      if (needsUpdate) {
        chrome.storage.local.set({ workbooks: updatedWorkbooks }, () => {
          console.log('BOJ Progression: progress 값 수정 완료');
          // 수정 후 다시 업데이트
          updateProgressBarsWithData(updatedWorkbooks);
        });
        return;
      }
      
      updateProgressBarsWithData(workbooks);
    });
  }
  
  // progress-bar 업데이트 헬퍼 함수
  function updateProgressBarsWithData(workbooks) {
      const table = document.querySelector('table.table.table-striped.table-bordered');
      if (!table) {
        console.warn('BOJ Progression: 테이블을 찾을 수 없습니다');
        return;
      }
      
      const rows = table.querySelectorAll('tbody tr');
      console.log(`BOJ Progression: ${rows.length}개의 워크북 행 발견`);
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        
        const workbookIdCell = cells[0];
        const progressCell = cells[3];
        
        if (workbookIdCell && progressCell) {
          const workbookId = parseInt(workbookIdCell.textContent.trim());
          const workbook = workbooks[workbookId];
          
          if (workbook) {
            const solvedProblems = workbook.solvedProblems;
            const totalProblems = workbook.totalProblems;
            
            // 진행률 계산 - solvedProblems와 totalProblems가 있으면 항상 계산
            let progress = 0;
            
            if (typeof solvedProblems === 'number' && typeof totalProblems === 'number' && totalProblems > 0) {
              // solvedProblems와 totalProblems가 있으면 무조건 계산해서 사용
              progress = Math.round((solvedProblems / totalProblems) * 100);
            } else if (typeof workbook.progress === 'number' && workbook.progress >= 0) {
              // solvedProblems/totalProblems가 없으면 저장된 progress 사용
              progress = workbook.progress;
            }
            
            console.log(`BOJ Progression: 워크북 #${workbookId} 업데이트 시도`);
            console.log(`  - 저장된 solvedProblems: ${solvedProblems} (${typeof solvedProblems})`);
            console.log(`  - 저장된 totalProblems: ${totalProblems} (${typeof totalProblems})`);
            console.log(`  - 저장된 progress: ${workbook.progress} (${typeof workbook.progress})`);
            console.log(`  - 최종 progress: ${progress}%`);
            console.log(`  - 전체 workbook 데이터:`, JSON.stringify(workbook, null, 2));
            
            // 데이터가 있으면 무조건 업데이트
            if (solvedProblems !== undefined && totalProblems !== undefined) {
              // solvedProblems와 totalProblems가 있으면 무조건 업데이트
              updateProgressBarWithText(progressCell, progress, solvedProblems, totalProblems);
            } else if (progress > 0 || (typeof workbook.progress === 'number' && workbook.progress >= 0)) {
              // progress만 있어도 업데이트
              updateProgressBarWithText(progressCell, progress, undefined, undefined);
            } else {
              console.warn(`BOJ Progression: 워크북 #${workbookId} 진행률 데이터가 없습니다`, workbook);
            }
          } else {
            console.log(`BOJ Progression: 워크북 #${workbookId}에 대한 저장된 데이터가 없습니다`);
          }
        }
      });
  }
  
  // 워크북 상세 페이지에서 문제 목록 크롤링 (직접 방문한 경우)
  function crawlWorkbookDetailOnPage() {
    const workbookId = extractWorkbookId();
    if (!workbookId) return;
    
    // 페이지가 완전히 로드될 때까지 대기
    setTimeout(() => {
      let workbookTitle = '';
      const titleElement = document.querySelector('h1, .page-header, .workbook-title');
      if (titleElement) {
        workbookTitle = titleElement.textContent.trim();
      }
      
      const table = document.querySelector('table.table tbody');
      if (!table) {
        console.warn('BOJ Progression: 테이블을 찾을 수 없습니다');
        return;
      }
      
      const rows = table.querySelectorAll('tr');
      let totalProblems = 0;
      let solvedProblems = 0;
      const problems = [];
      
      rows.forEach(row => {
        const problemCell = row.querySelector('td:first-child');
        const titleCell = row.querySelector('td:nth-child(2)');
        const statusCell = row.querySelector('td:nth-child(3)');
        
        if (problemCell && titleCell) {
          const problemNumber = parseInt(problemCell.textContent.trim());
          const titleLink = titleCell.querySelector('a');
          const problemTitle = titleLink ? titleLink.textContent.trim() : '';
          
          // 성공 레이블 확인 (여러 방법 시도)
          let isSolved = false;
          if (statusCell) {
            // .problem-label-ac 클래스 확인
            const successLabel = statusCell.querySelector('.problem-label-ac');
            if (successLabel) {
              isSolved = true;
              console.log(`BOJ Progression: 문제 #${problemNumber} 성공 레이블 발견 (클래스)`);
            } else {
              // span 태그 내부의 텍스트 확인
              const statusSpans = statusCell.querySelectorAll('span');
              statusSpans.forEach(span => {
                const spanText = span.textContent.trim().toLowerCase();
                const spanClass = span.className.toLowerCase();
                if (spanClass.includes('ac') || spanText.includes('성공') || spanText.includes('ac')) {
                  isSolved = true;
                  console.log(`BOJ Progression: 문제 #${problemNumber} 성공 레이블 발견 (span)`);
                }
              });
              
              // 텍스트로도 확인
              if (!isSolved) {
                const statusText = statusCell.textContent.trim().toLowerCase();
                if (statusText.includes('성공') || statusText.includes('ac')) {
                  isSolved = true;
                  console.log(`BOJ Progression: 문제 #${problemNumber} 성공 레이블 발견 (텍스트)`);
                }
              }
            }
          }
          
          totalProblems++;
          if (isSolved) {
            solvedProblems++;
          }
          
          problems.push({
            number: problemNumber,
            title: problemTitle,
            solved: isSolved
          });
        }
      });
      
      if (totalProblems > 0) {
        const progressPercent = Math.round((solvedProblems / totalProblems) * 100);
        
        console.log(`BOJ Progression: 워크북 #${workbookId} 크롤링 완료`);
        console.log(`  - 총 문제: ${totalProblems}개`);
        console.log(`  - 해결한 문제: ${solvedProblems}개`);
        console.log(`  - 진행률: ${progressPercent}%`);
        console.log(`  - 해결한 문제 번호:`, problems.filter(p => p.solved).map(p => p.number));
        console.log(`  - 전체 문제:`, problems.map(p => ({ number: p.number, solved: p.solved })));
        
        const dataToSend = {
          type: 'WORKBOOK_DETAIL_DATA',
          workbookId: workbookId,
          title: workbookTitle,
          totalProblems: totalProblems,
          solvedProblems: solvedProblems,
          problems: problems,
          progress: progressPercent
        };
        
        console.log('BOJ Progression: 전송할 데이터:', JSON.stringify(dataToSend, null, 2));
        
        chrome.runtime.sendMessage(dataToSend, (response) => {
          if (chrome.runtime.lastError) {
            console.error('BOJ Progression: 메시지 전송 실패:', chrome.runtime.lastError);
          } else {
            console.log('BOJ Progression: 데이터 저장 완료', response);
          }
        });
      } else {
        console.warn('BOJ Progression: 문제를 찾을 수 없습니다');
      }
    }, 500);
  }
  
  // 페이지 타입에 따라 적절한 크롤링 함수 실행
  function initCrawling() {
    const path = window.location.pathname;
    
    // /workbook/top 또는 /workbook/top/숫자 페이지
    if (path.match(/^\/workbook\/top(\/\d+)?$/)) {
      setTimeout(() => {
        crawlWorkbookList();
        setTimeout(() => {
          updateAllWorkbookProgressBars();
        }, 500);
      }, 100);
    } else if (path.match(/^\/workbook\/view\/\d+$/)) {
      setTimeout(() => {
        crawlWorkbookDetailOnPage();
      }, 100);
    }
  }
  
  // 메시지 리스너
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REFRESH_DATA') {
      initCrawling();
      sendResponse({ success: true });
    } else if (message.type === 'UPDATE_PROGRESS_BARS') {
      // 데이터 업데이트 후 progress-bar 갱신 요청
      updateAllWorkbookProgressBars();
      sendResponse({ success: true });
    } else if (message.type === 'CRAWL_THIS_PAGE') {
      // background에서 요청한 크롤링
      if (window.location.pathname.match(/^\/workbook\/view\/\d+$/)) {
        crawlWorkbookDetailOnPage();
        sendResponse({ success: true });
      }
    }
    return true;
  });
  
  // storage 변경 감지하여 progress-bar 자동 업데이트
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.workbooks) {
      const path = window.location.pathname;
      if (path.match(/^\/workbook\/top(\/\d+)?$/)) {
        console.log('BOJ Progression: 워크북 데이터 변경 감지, progress-bar 업데이트');
        setTimeout(() => {
          updateAllWorkbookProgressBars();
        }, 300);
      }
    }
  });
  
  // 페이지 로드 완료 후 크롤링 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrawling);
  } else {
    initCrawling();
  }
  
  // SPA 네비게이션을 위한 MutationObserver
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(initCrawling, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
})();

