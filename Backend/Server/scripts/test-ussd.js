const { get } = require('../engine/db');
const ussd = require('../engine/ussd');

(async () => {
    console.log('=== USSD MENU TEST ===\n');
    try {
        const p = await get(`SELECT * FROM providers LIMIT 1`);
        if (!p) { console.error('No providers in DB'); process.exit(1); }
        console.log('Provider: ' + p.full_name + ' (' + p.phone + ')\n');

        const sid = 'USSD-TEST-' + Date.now();

        let r = await ussd.handleUssd(p.phone, sid, '');
        console.log('1. Open session:');
        console.log(r.text.split('\n').map(l => '   ' + l).join('\n'));

        r = await ussd.handleUssd(p.phone, sid, '4');
        console.log('\n2. Press 4 (Wallet):');
        console.log(r.text.split('\n').map(l => '   ' + l).join('\n'));

        r = await ussd.handleUssd(p.phone, sid, '0');
        console.log('\n3. Press 0 (Back) ??? main menu');

        r = await ussd.handleUssd(p.phone, sid, '3');
        console.log('\n4. Press 3 (Availability):');
        console.log(r.text.split('\n').map(l => '   ' + l).join('\n'));

        r = await ussd.handleUssd(p.phone, sid, '2');
        console.log('\n5. Press 2 (Laundry OFF):');
        console.log('   ' + r.text.replace(/\n/g, '\n   '));

        r = await ussd.handleUssd(p.phone, sid, '0');
        console.log('\n6. Back to main');

        r = await ussd.handleUssd(p.phone, sid, '5');
        console.log('\n7. Press 5 (Top Up):');
        console.log('   ' + r.text.replace(/\n/g, '\n   '));

        r = await ussd.handleUssd(p.phone, sid, '2');
        console.log('\n8. Press 2 (K100):');
        console.log('   ' + r.text.replace(/\n/g, '\n   '));

        r = await ussd.handleUssd(p.phone, sid, '9');
        console.log('\n9. Press 9 (Logout):');
        console.log('   ' + r.text);

        const s = await get(`SELECT current_menu, ended_at FROM ussd_sessions WHERE session_id = ?`, [sid]);
        console.log('\n10. Final: menu=' + s.current_menu + ' ended_at=' + (s.ended_at ? 'CLOSED' : 'OPEN'));

        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
