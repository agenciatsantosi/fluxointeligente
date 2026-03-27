import { addToAutomationQueue, clearAutomationQueue } from '../services/database.js';

async function testVariation() {
    console.log('--- TESTANDO VARIAÇÃO ALEATÓRIA ---');
    
    // Mock the platform, config, and user
    const platform = 'facebook';
    const config = {
        schedule: {
            times: ['07:00', '12:00', '18:00'],
            randomVariation: 10
        }
    };
    const userId = 1;
    const scheduleId = 999;

    const times = config.schedule.times;
    const variationMinutes = config.schedule.randomVariation;
    const now = new Date();
    
    const results = [];

    for (let day = 0; day < 100; day++) {
        for (const baseTime of times) {
            const [hour, minute] = baseTime.split(':').map(Number);
            
            let plannedTime = new Date();
            plannedTime.setHours(hour, minute, 0, 0);
            
            // Apply random variation (copied from schedulerService.js)
            if (variationMinutes > 0) {
                const variation = (Math.random() * variationMinutes * 2) - variationMinutes;
                plannedTime.setMinutes(plannedTime.getMinutes() + Math.round(variation));
            }
            
            const diff = (plannedTime.getTime() - new Date().setHours(hour, minute, 0, 0)) / 60000;
            results.push(diff);
        }
    }

    const min = Math.min(...results);
    const max = Math.max(...results);
    const avg = results.reduce((a, b) => a + b) / results.length;

    console.log(`Simulação de 300 postagens concluída.`);
    console.log(`Variação Alvo: ±${variationMinutes} min`);
    console.log(`Min: ${min.toFixed(2)} min`);
    console.log(`Max: ${max.toFixed(2)} min`);
    console.log(`Avg: ${avg.toFixed(2)} min`);

    if (min >= -variationMinutes && max <= variationMinutes) {
        console.log('✅ TESTE PASSOU: Variação dentro dos limites.');
    } else {
        console.log('❌ TESTE FALHOU: Variação fora dos limites!');
    }
}

testVariation();
