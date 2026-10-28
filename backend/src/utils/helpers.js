exports.genAccountNumber = ()=> String(Math.floor(1000000000 + Math.random()*9000000000));
exports.genCardNumber = ()=> '4111 ' + [1,2,3].map(()=>Math.floor(1000+Math.random()*9000)).join(' ') + ' ' + Math.floor(1000+Math.random()*9000);
