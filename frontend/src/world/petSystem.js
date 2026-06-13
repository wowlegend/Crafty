// petSystem.js — the pet/companion system hook (extracted from AdvancedGameFeatures S3-M4 p3;
// mounted once in App). Verbatim, same behavior.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';

export const usePetSystem = () => {
    const [pets, setPets] = useState([]);
    const [petNotification, setPetNotification] = useState(null);
    const [petOrder, setPetOrder] = useState('follow'); // 'follow', 'stay', 'attack'
    const stayCoordinates = useRef([0, 0, 0]);
    const maxPets = 3;

    const tameMob = useCallback((mobId, mobType, mobPosition) => {
        if (pets.length >= maxPets) {
            setPetNotification('You already have 3 pets! Release one first.');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        if (mobType !== 'pig' && mobType !== 'cow') {
            setPetNotification('Only pigs and cows can be tamed with wheat/apples!');
            setTimeout(() => setPetNotification(null), 3000);
            return false;
        }

        const petNames = ['Buddy', 'Patches', 'Barnaby', 'Coco', 'Fudge', 'Nugget', 'Waffles', 'Cookie'];
        const name = petNames[Math.floor(Math.random() * petNames.length)];

        const newPet = {
            id: mobId,
            type: mobType,
            name,
            position: [...mobPosition],
            health: mobType === 'cow' ? 120 : 70, // Slightly stronger stats
            maxHealth: mobType === 'cow' ? 120 : 70,
            tamedAt: Date.now(),
        };

        setPets(prev => [...prev, newPet]);
        setPetNotification(`Tamed! Say hello to your new pet ${name}!`);
        setTimeout(() => setPetNotification(null), 4000);

        return true;
    }, [pets.length]);

    // keydown listener for keyboard T key to cycle pet commands
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key.toLowerCase() === 't') {
                setPets(currentPets => {
                    if (currentPets.length === 0) return currentPets;
                    
                    setPetOrder(prev => {
                        let next = 'follow';
                        if (prev === 'follow') next = 'stay';
                        else if (prev === 'stay') next = 'attack';
                        
                        let msg = '';
                        if (next === 'follow') {
                            msg = 'Pets ordered to: FOLLOW player';
                        } else if (next === 'stay') {
                            msg = 'Pets ordered to: STAY at current location';
                            const pPos = useGameStore.getState().playerPosition;
                            if (pPos) {
                                stayCoordinates.current = [pPos.x, pPos.y, pPos.z];
                            }
                        } else if (next === 'attack') {
                            msg = 'Pets ordered to: ATTACK nearest hostile!';
                        }
                        
                        setPetNotification(msg);
                        setTimeout(() => setPetNotification(null), 3500);
                        return next;
                    });
                    return currentPets;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        useGameStore.setState({ tameMob: tameMob });
        useGameStore.setState({ getPets: () => pets });
        useGameStore.setState({ petOrder: petOrder });
        useGameStore.setState({ stayCoordinates: stayCoordinates.current });
    }, [tameMob, pets, petOrder]);

    return { pets, petNotification, tameMob, petOrder };
};
