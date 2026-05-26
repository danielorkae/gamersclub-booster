const findCsrepTab = () => new Promise( resolve => {
  chrome.tabs.query( { url: 'https://csrep.gg/*' }, tabs => resolve( tabs[0] || null ) );
} );

let pendingCsrepTab = null;

const openCsrepTab = () => new Promise( resolve => {
  chrome.tabs.create( { url: 'https://csrep.gg', active: false }, tab => {
    const onUpdated = ( tabId, info, updatedTab ) => {
      if ( tabId === tab.id && info.status === 'complete' && updatedTab.url?.startsWith( 'https://csrep.gg' ) ) {
        chrome.tabs.onUpdated.removeListener( onUpdated );
        resolve( updatedTab );
      }
    };
    chrome.tabs.onUpdated.addListener( onUpdated );
  } );
} );

const getOrOpenCsrepTab = async () => {
  const existing = await findCsrepTab();
  if ( existing ) { return existing; }
  if ( !pendingCsrepTab ) {
    pendingCsrepTab = openCsrepTab().finally( () => { pendingCsrepTab = null; } );
  }
  return pendingCsrepTab;
};

chrome.runtime.onMessage.addListener( ( message, _sender, sendResponse ) => {
  if ( message.type !== 'FETCH_TRUST_RATING' ) { return; }

  ( async () => {
    const tab = await getOrOpenCsrepTab();
    try {
      const response = await chrome.tabs.sendMessage( tab.id, {
        type: 'FETCH_TRUST_RATING_PROXY',
        steamId: message.steamId
      } );
      sendResponse( response );
    } catch ( err ) {
      sendResponse( { success: false, error: err.message } );
    }
  } )();

  return true;
} );
