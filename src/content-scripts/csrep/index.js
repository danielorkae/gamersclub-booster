/* eslint-disable no-bitwise */
const computeSecret = ( uuid, timestamp ) => {
  const input = `${uuid}${timestamp}`;
  let t = 0;
  for ( let i = 0; i < input.length; i++ ) { t = ( t << 5 ) - t + input.charCodeAt( i ) | 0; }
  return ( t >>> 0 ).toString( 36 );
};
/* eslint-enable no-bitwise */

chrome.runtime.onMessage.addListener( ( message, _sender, sendResponse ) => {
  if ( message.type !== 'FETCH_TRUST_RATING_PROXY' ) { return; }

  const url = `https://csrep.gg/api/players/${message.steamId}/reputation`;
  const requestId = crypto.randomUUID();
  const timestamp = Date.now();
  const secret = computeSecret( requestId, timestamp );

  fetch( url, {
    credentials: 'include',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'x-request-timestamp': timestamp.toString(),
      'x-request-secret': secret,
      'x-request-id': requestId,
      'referer': `https://csrep.gg/player/${message.steamId}`
    }
  } )
    .then( res => res.json() )
    .then( data => sendResponse( { success: true, data } ) )
    .catch( err => sendResponse( { success: false, error: String( err ) } ) );

  return true;
} );
