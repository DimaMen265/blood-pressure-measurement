import { useEffect, useState, useRef } from "react";

type Measurement = {
    systolic: number;
    diastolic: number;
    pulse: number;
};

type SavedRecord = {
    id?: number;
    timestamp: string;
    systolic: number;
    diastolic: number;
    pulse: number;
};

const DB_NAME = 'HealthJuornal';
const STORE_NAME = 'BloodPressureRecords';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            };
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const addRecord = (record: SavedRecord): Promise<number> => {
    return new Promise((resolve, reject) => {
        (async () => {
            try {
                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.add(record);

                req.onsuccess = () => resolve(req.result as number);
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        })();
    });
};

const validate = (m: Measurement): string | null => {
    if (
        isNaN(m.systolic) ||
        isNaN(m.diastolic) ||
        isNaN(m.pulse)
    ) {
        return 'Усі поля мають бути числовими.';
    };
    if (m.systolic <= m.diastolic) {
        return 'Систолічний має бути більшим за діастолічний.';
    };
    if (m.systolic > 300) {
        return 'Систолічний має бути ≤ 300.';
    };
    if (m.diastolic > 200) {
        return 'Діастолічний має бути ≤ 200.';
    };
    if (m.pulse < 30 || m.pulse > 220) {
        return 'Пульс повинен бути в межах 30–220.';
    };
    return null;
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60)
        .toString()
        .padStart(2, '0');
    
    return `${m}:${s}`;
};

export const BloodPressureMeasurement: React.FC = () => {
    const [stage, setStage] = useState<
        'prep-question' | 'prep-wait' | 'measuring' | 'done'
    >('prep-question');
    const [prepTimer, setPrepTimer] = useState(300);
    const prepInterval = useRef<number | null>(null);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [inputs, setInputs] = useState({
        systolic: '',
        diastolic: '',
        pulse: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const cooldownInterval = useRef<number | null>(null);
    const [savingStatus, setSavingStatus] = useState<string | null>(null);
    const [average, setAverage] = useState<SavedRecord | null>(null);

    useEffect(() => {
        if (stage === 'prep-wait') {
            const endTime = Date.now() + prepTimer * 1000;
            localStorage.setItem('prep_end_time', endTime.toString());

            if (prepInterval.current) window.clearInterval(prepInterval.current);
            prepInterval.current = window.setInterval(() => {
                const savedEnd = localStorage.getItem('prep_end_time');
                if (!savedEnd) return;

                const remaining = Math.max(0, Math.ceil((Number(savedEnd) - Date.now()) / 1000));
                setPrepTimer(remaining);

                if (remaining <= 0) {
                    if (prepInterval.current) window.clearInterval(prepInterval.current);
                    setStage('measuring');
                }
            }, 1000);
        }

        return () => {
            if (prepInterval.current) window.clearInterval(prepInterval.current);
        };
    }, [stage]);

    useEffect(() => {
        if (cooldown > 0) {
            const endTime = Date.now() + cooldown * 1000;
            localStorage.setItem('cooldown_end_time', endTime.toString());

            if (cooldownInterval.current) window.clearInterval(cooldownInterval.current);
            cooldownInterval.current = window.setInterval(() => {
                const savedEnd = localStorage.getItem('cooldown_end_time');
                if (!savedEnd) return;

                const remaining = Math.max(0, Math.ceil((Number(savedEnd) - Date.now()) / 1000));
                setCooldown(remaining);

                if (remaining <= 0) {
                    if (cooldownInterval.current) window.clearInterval(cooldownInterval.current);
                    setInputs({ systolic: '', diastolic: '', pulse: '' });
                };
            }, 1000);
        }

        return () => {
            if (cooldownInterval.current) window.clearInterval(cooldownInterval.current);
        };
    }, [cooldown]);

    const handleStartPrep = () => {
        setStage('measuring');
    };

    const handleWaitPrep = () => {
        setStage('prep-wait');
        setPrepTimer(300);
    };

    const handleInputChange = (field: string, value: string) => {
        setInputs(i => {
            const updated = { ...i, [field]: value };

            const m: Measurement = {
                systolic: parseFloat(updated.systolic),
                diastolic: parseFloat(updated.diastolic),
                pulse: parseFloat(updated.pulse),
            };

            if (
                updated.systolic.trim() &&
                updated.diastolic.trim() &&
                updated.pulse.trim() &&
                !validate(m)
            ) {
                setError(null);
            };

            return updated;
        });
    };

    const handleSaveMeasurement = () => {
        setError(null);
        const m: Measurement = {
            systolic: parseFloat(inputs.systolic),
            diastolic: parseFloat(inputs.diastolic),
            pulse: parseFloat(inputs.pulse),
        };
        const validation = validate(m);
    
        if (validation) {
            setError('❌ Неправильні значення: ' + validation);
            return;
        };
    
        setMeasurements(prev => [...prev, m]);
        setSavingStatus(null);

        if (currentIndex < 2) {
            setCooldown(90);

            const timeout = setTimeout(() => {
                setCurrentIndex(ci => ci + 1);
            }, 90 * 1000);
            // якщо користувач перезавантажить вікно, цей таймаут зникне — в нормальному апі можна покращити збереженням часу старта.
            return () => clearTimeout(timeout);
        } else {
            computeAndSaveAverage([...measurements, m]);
            setInputs({ systolic: '', diastolic: '', pulse: '' });
        };
    };

    const computeAndSaveAverage = async (all: Measurement[]) => {
        const avgSystolic = Math.round(
            all.reduce((sum, x) => sum + x.systolic, 0) / 3
        );
        const avgDiastolic = Math.round(
            all.reduce((sum, x) => sum + x.diastolic, 0) / 3
        );
        const avgPulse = Math.round(all.reduce((sum, x) => sum + x.pulse, 0) / 3);

        const record: SavedRecord = {
            timestamp: new Date().toISOString(),
            systolic: avgSystolic,
            diastolic: avgDiastolic,
            pulse: avgPulse,
        };

        try {
            const id = await addRecord(record);
            setAverage({ ...record, id });
            setSavingStatus('✅ Запис успішно збережено в історію');
            setStage('done');
        } catch (e: unknown) {
            const err = e as { message?: string };
            setSavingStatus('❌ Помилка збереження: ' + (err?.message || String(err)));
        }
    };

    return (
        <div className="max-w-sm mx-auto p-4">
            <h1 className="text-2xl font-bold text-center text-indigo-600 mb-6">
                Вимірювання тиску
            </h1>

            {stage === 'prep-question' && (
                <div className="space-y-4">
                    <p className="text-lg font-medium text-gray-800 text-center">
                        Чи відпочили Ви 5 хвилин перед вимірюванням?
                    </p>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleStartPrep}
                            className="w-full py-4 rounded-lg bg-green-500 text-white font-semibold shadow cursor-pointer transition-colors duration-300 ease-in-out hover:bg-green-600 text-lg"
                        >
                            ✅ Так
                        </button>
                        <button
                            onClick={handleWaitPrep}
                            className="w-full py-4 rounded-lg bg-yellow-400 text-white font-semibold shadow cursor-pointer transition-colors duration-300 ease-in-out hover:bg-yellow-500 text-lg"
                        >
                            ❌ Ні, почати відпочинок
                        </button>
                    </div>
                </div>
            )}

            {stage === 'prep-wait' && (
                <div className="flex flex-col items-center gap-3">
                    <p className="text-lg font-medium text-gray-700">Зачекайте 5 хвилин</p>
                    <div className="text-5xl font-mono text-indigo-600">{formatTime(prepTimer)}</div>
                    <p className="text-sm text-gray-500 text-center">
                        Після завершення почнеться замір
                    </p>
                </div>
            )}

            {stage === 'measuring' && (
                <div className="space-y-4">
                    <div className="flex justify-between text-indigo-700 text-lg font-semibold">
                        <span>Замір {currentIndex + 1} з 3</span>
                        {cooldown > 0 && (
                            <span className="text-sm text-gray-500">
                                Через: {formatTime(cooldown)}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {['systolic', 'diastolic', 'pulse'].map((field) => {
                            const labels: Record<string, string> = {
                                systolic: 'Систолічний',
                                diastolic: 'Діастолічний',
                                pulse: 'Пульс',
                            };
                            const placeholders: Record<string, string> = {
                                systolic: '120',
                                diastolic: '80',
                                pulse: '70',
                            };
                            return (
                                <div key={field} className="flex flex-col">
                                    <label htmlFor={field} className="text-sm font-medium text-gray-700 mb-1">
                                        {labels[field]}
                                    </label>
                                    <input
                                        id={field}
                                        type="number"
                                        value={inputs[field as keyof typeof inputs]}
                                        onChange={(e) => handleInputChange(field, e.target.value)}
                                        disabled={cooldown > 0}
                                        placeholder={placeholders[field]}
                                        className="rounded-lg border border-gray-300 p-4 text-lg text-gray-900 placeholder-gray-400
                                                   focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {error && (
                        <div className="rounded bg-red-100 text-red-800 px-4 py-3 font-medium text-center">
                            {error}
                        </div>
                    )}

                    <button
                        disabled={
                            cooldown > 0 ||
                            !inputs.systolic.trim() ||
                            !inputs.diastolic.trim() ||
                            !inputs.pulse.trim()
                        }
                        onClick={handleSaveMeasurement}
                        className="w-full bg-indigo-600 text-white font-semibold py-4 rounded-lg shadow cursor-pointer transition-colors duration-300 ease-in-out hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 text-lg"
                    >
                        ✅ Зберегти
                    </button>

                    {measurements.length > 0 && (
                        <div className="text-sm text-gray-600 text-center">
                            Збережено: {measurements.length}
                        </div>
                    )}
                </div>
            )}

            {stage === 'done' && average && (
                <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-4 shadow-inner">
                    <h2 className="text-xl font-bold text-green-700 text-center">Середній результат</h2>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-sm text-green-600">Систолічний</div>
                            <div className="text-2xl text-green-700 font-bold">{average.systolic}</div>
                        </div>
                        <div>
                            <div className="text-sm text-green-600">Діастолічний</div>
                            <div className="text-2xl text-green-700 font-bold">{average.diastolic}</div>
                        </div>
                        <div>
                            <div className="text-sm text-green-600">Пульс</div>
                            <div className="text-2xl text-green-700 font-bold">{average.pulse}</div>
                        </div>
                    </div>
                    <div className="text-xs text-green-700 text-center">
                        {new Date(average.timestamp).toLocaleString()}
                    </div>
                    {savingStatus && (
                        <div className="text-center font-semibold text-green-800">
                            {savingStatus}
                        </div>
                    )}
                </div>
            )}

            {savingStatus && stage !== 'done' && (
                <div
                    className={`rounded-md px-4 py-3 mt-4 text-center font-semibold shadow-md
                    ${savingStatus.startsWith('✅')
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'}`}
                >
                    {savingStatus}
                </div>
            )}
        </div>
    );
};
