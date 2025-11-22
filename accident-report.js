// 事故報告フォーム JavaScript - URLSearchParams + 画質改善版 v20250728001

// 設定
const config = {
    woffId: 'k7_SVZ1p8vy45jQkIRvOUw', // 本番環境のWOFF ID
   gasUrl: 'https://script.google.com/macros/s/AKfycbxs8lyQWVQ5OOKQsLXFO8arNG-TuavpaN5Nblk2ud7YsxF6dRz-NgVR75JdB7HSoFEl8Q/exec', // Cruto様本番環境
    
   // gasUrl: 'https://script.google.com/macros/s/AKfycby5fRaVu5vISA3dvflBAaYXtWtBGXRyWt9HpWYlAiWbqqHzyBxSAt6vpWn6NuWFk8Gj/exec', // 村松テスト

    
    googleMapsApiKey: 'AIzaSyCdhA4t8flujiYex2OddJCkFv4u6nWvi9w' // Google Maps Geocoding API
};


// グローバル変数
let formData = {};
let photoData = {
    scene: [],
    property: [],
    otherVehicle: [],
    ownVehicle: [],
    license: []
};
let userOrganization = '';
let availableOffices = [];

// キャッシュ機能
const cache = {
    offices: null,
    officesExpiry: null,
    CACHE_DURATION: 5 * 60 * 1000 // 5分間キャッシュ
};

// 強制キャッシュクリア
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
        }
    });
}

// 初期化
document.addEventListener('DOMContentLoaded', async function() {
    // バージョン確認用ログ（確認後削除）
    console.log('🔄 Script loaded: v20250728001, DOMContentLoaded fired');
    
    // フォーム要素の存在確認
    const form = document.getElementById('accidentReportForm');
    const reporter = document.getElementById('reporter');
    const officeContainer = document.getElementById('officeContainer');
    
    console.log('📋 Elements check:', {
        form: !!form,
        reporter: !!reporter,
        officeContainer: !!officeContainer
    });
    
    if (!form) {
        console.error('❌ フォーム要素が見つかりません');
        return;
    }
    
    try {
        // まず最初にイベントリスナーを設定（フォーム操作を即座に有効化）
        console.log('⚙️ Setting up event listeners...');
        setupEventListeners();
       // 初期状態では写真は任意（事故種類が未選択 or その他）
        try {
            const initialType = document.querySelector('input[name="accidentType"]:checked')?.value;
            setScenePhotoRequired(initialType === 'vehicle');
        } catch (_) {
            // 初期化中は無視
        }
        console.log('✅ Event listeners setup complete');
    } catch (eventError) {
        console.error('❌ Event listener setup failed:', eventError);
        return;
    }
    
    try {
        // WOFF初期化
        console.log('🔄 Starting WOFF initialization...');
        const profile = await WOFFManager.init(config.woffId);
        console.log('✅ WOFF initialization successful:', profile);
        
        // 報告者名を設定
        document.getElementById('reporter').value = profile.displayName;
        console.log('👤 Reporter name set:', profile.displayName);
        
        // 今日の日付を設定（即座に実行）
        const today = new Date();
        document.getElementById('incidentDate').value = today.toISOString().split('T')[0];
        console.log('📅 Date set:', today.toISOString().split('T')[0]);
        
        // ユーザーの組織情報を非同期で取得（ブロッキングしない）
        console.log('🏢 Getting user organization...');
        getUserOrganization(profile.userId);
        
        
    } catch (error) {
        // 初期化エラー
        console.error('初期化エラー:', error);
        
        // WOFF初期化に失敗しても、フォームは使えるようにする
        document.getElementById('reporter').value = 'テストユーザー';
        const today = new Date();
        document.getElementById('incidentDate').value = today.toISOString().split('T')[0];
        
        // デフォルトの事業所選択肢を表示
        const officeContainer = document.getElementById('officeContainer');
        const officeSelect = document.getElementById('office');
        
        // ローディングメッセージを削除
        officeContainer.innerHTML = '';
        
        // selectを表示
        officeSelect.innerHTML = `
            <option value="">選択してください</option>
            <option value="本社">本社</option>
            <option value="関東支店">関東支店</option>
            <option value="関西支店">関西支店</option>
        `;
        officeSelect.style.display = 'block';
        
    }
});

// ユーザーの組織情報を取得
async function getUserOrganization(userId) {
    try {
        const requestData = {
            action: 'getUserOrganization',
            userId: userId
        };
        
        let response;
        let result;
        
        try {
            // GETリクエストでパラメータとして送信（CORS回避）
            const params = new URLSearchParams(requestData);
            const getUrl = `${config.gasUrl}?${params.toString()}`;
            
            response = await fetch(getUrl, {
                method: 'GET',
                redirect: 'follow',
                mode: 'cors'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // レスポンステキストを先に取得してログ出力
            const responseText = await response.text();
            
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                    throw new Error('レスポンスのJSON解析に失敗: ' + parseError.message);
            }
        } catch (fetchError) {
            throw new Error('ネットワークエラー: ' + fetchError.message);
        }
        
        if (result && result.orgUnitName) {
            userOrganization = result.orgUnitName;
            
            // 事業所フィールドを設定
            const officeContainer = document.getElementById('officeContainer');
            const officeSelect = document.getElementById('office');
            
            // ローディングメッセージを削除
            officeContainer.innerHTML = '';
            
            // 取得した組織をデフォルトとして設定し、selectを表示
            officeSelect.innerHTML = `<option value="${userOrganization}">${userOrganization}</option>`;
            officeSelect.value = userOrganization;
            officeSelect.style.display = 'block';
            
            // 事業所一覧を非同期で取得してプルダウンに追加
            loadOfficesFromSheet().then(() => {
                // 事業所一覧取得後、現在の組織が先頭に表示されるよう調整
                if (availableOffices.length > 0) {
                    const currentOption = `<option value="${userOrganization}" selected>${userOrganization}</option>`;
                    const otherOptions = availableOffices
                        .filter(office => office.value !== userOrganization)
                        .map(office => `<option value="${office.value}">${office.name}</option>`)
                        .join('');
                    officeSelect.innerHTML = currentOption + otherOptions;
                }
            }).catch(error => {
                console.error('事業所一覧の取得に失敗:', error);
            });
            
        } else if (result && Array.isArray(result)) {
            // フォールバック: 事業所一覧を取得した場合
            loadOfficesFromAPIResponse(result);
            
        } else {
            throw new Error('組織情報を取得できませんでした - result: ' + JSON.stringify(result));
        }
        
    } catch (error) {
        console.error('組織情報取得エラー:', error);
        // フォールバック: 手動選択
        await loadOfficesFromSheet();
    }
}

// APIレスポンスから事業所一覧を設定
function loadOfficesFromAPIResponse(offices) {
    if (offices && Array.isArray(offices)) {
        availableOffices = offices;
        
        const officeContainer = document.getElementById('officeContainer');
        const officeSelect = document.getElementById('office');
        
        // ローディングメッセージを削除
        officeContainer.innerHTML = '';
        
        // 事業所選択肢を設定
        officeSelect.innerHTML = '<option value="">選択してください</option>';
        
        offices.forEach(office => {
            const option = document.createElement('option');
            option.value = office.value;
            option.textContent = office.name;
            officeSelect.appendChild(option);
        });
        
        officeSelect.style.display = 'block';
    } else {
        return loadOfficesFromSheet();
    }
}

// Sheetsから事業所一覧を取得（10秒タイムアウト付き、GET方式に変更）
async function loadOfficesFromSheet() {
    // キャッシュチェック
    if (cache.offices && cache.officesExpiry && Date.now() < cache.officesExpiry) {
        return loadOfficesFromCache();
    }
    
    try {
        // 事業所情報取得開始
        // Promise.raceでタイムアウト制御
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('タイムアウト: 10秒以内に応答がありませんでした')), 10000);
        });
        
        // GET方式でパラメータ送信（getUserOrganizationと同じ成功パターン）
        const requestData = {
            action: 'getOffices'
        };
        const params = new URLSearchParams(requestData);
        const getUrl = `${config.gasUrl}?${params.toString()}`;
        
        const fetchPromise = fetch(getUrl, {
            method: 'GET',
            redirect: 'follow',
            mode: 'cors'
        });
        
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const offices = await response.json();
        
        if (offices && Array.isArray(offices)) {
            availableOffices = offices;
            
            // キャッシュに保存
            cache.offices = offices;
            cache.officesExpiry = Date.now() + cache.CACHE_DURATION;
            
            console.log('✅ 事業所一覧取得成功:', offices.length + '件（キャッシュ更新）');
            
            // 現在のofficeSelectの状態を確認
            const officeSelect = document.getElementById('office');
            if (officeSelect.style.display === 'none') {
                // まだ表示されていない場合のみ、ローディングメッセージを削除
                const officeContainer = document.getElementById('officeContainer');
                officeContainer.innerHTML = '';
                
                officeSelect.innerHTML = '<option value="">選択してください</option>';
                
                offices.forEach(office => {
                    const option = document.createElement('option');
                    option.value = office.value;
                    option.textContent = office.name;
                    officeSelect.appendChild(option);
                });
                
                officeSelect.style.display = 'block';
            }
        } else {
            throw new Error('事業所データが無効な形式です');
        }
        
    } catch (error) {
        console.error('事業所情報取得エラー:', error);
        
        // フォールバック: 基本的な事業所選択肢を提供
        
        const defaultOffices = [
            { value: '本社', name: '本社' },
            { value: '関東支店', name: '関東支店' },
            { value: '関西支店', name: '関西支店' }
        ];
        
        availableOffices = defaultOffices;
        
        const officeContainer = document.getElementById('officeContainer');
        const officeSelect = document.getElementById('office');
        
        officeContainer.innerHTML = '';
        officeSelect.innerHTML = '<option value="">選択してください</option>';
        
        defaultOffices.forEach(office => {
            const option = document.createElement('option');
            option.value = office.value;
            option.textContent = office.name;
            officeSelect.appendChild(option);
        });
        
        officeSelect.style.display = 'block';
        
        // ユーザーに通知（非ブロッキング）
        setTimeout(() => {
            alert('事業所情報の取得に時間がかかっています。基本的な選択肢を表示しています。');
        }, 100);
    }
}

// キャッシュから事業所データを読み込み
function loadOfficesFromCache() {
    const offices = cache.offices;
    availableOffices = offices;
    
    const officeSelect = document.getElementById('office');
    officeSelect.innerHTML = '<option value="">選択してください</option>';
    
    offices.forEach(office => {
        const option = document.createElement('option');
        option.value = office.value;
        option.textContent = office.name;
        officeSelect.appendChild(option);
    });
    
    officeSelect.style.display = 'block';
}

// 不要な関数を削除（プルダウン選択に変更したため）

// イベントリスナーの設定
function setupEventListeners() {
        // 「その他」用の利用者名フィールドを動的に挿入
    ensureOtherUserNameField();
    // 事故種類の選択による表示切替
    document.querySelectorAll('input[name="accidentType"]').forEach(radio => {
        radio.addEventListener('change', handleAccidentTypeChange);
    });
    
    // 対物ありの場合の詳細表示
    document.querySelectorAll('input[name="propertyDamage"]').forEach(radio => {
        radio.addEventListener('change', handlePropertyDamageChange);
    });
    
    // 対人ありの場合の詳細表示
    document.querySelectorAll('input[name="personalInjury"]').forEach(radio => {
        radio.addEventListener('change', handlePersonalInjuryChange);
    });
    
    // 場所分類による詳細場所の表示
    const locationCategory = document.getElementById('locationCategory');
    if (locationCategory) {
        locationCategory.addEventListener('change', handleLocationCategoryChange);
    }
    
    // 詳細場所でその他を選択した場合
    const detailLocation = document.getElementById('detailLocation');
    if (detailLocation) {
        detailLocation.addEventListener('change', handleDetailLocationChange);
    }
    
    // GPS取得ボタン
    const getLocationBtn = document.getElementById('getLocationBtn');
    if (getLocationBtn) {
        getLocationBtn.addEventListener('click', getLocation);
    }
    
    // 写真アップロード
    setupPhotoUpload('scenePhoto', 'scenePhotoUpload', 'scenePhotoPreview', 'scene');
    setupPhotoUpload('otherVehiclePhoto', 'otherVehiclePhotoUpload', 'otherVehiclePhotoPreview', 'otherVehicle');
    setupPhotoUpload('ownVehiclePhoto', 'ownVehiclePhotoUpload', 'ownVehiclePhotoPreview', 'ownVehicle');
    setupPhotoUpload('propertyPhoto', 'propertyPhotoUpload', 'propertyPhotoPreview', 'property');
    setupPhotoUpload('licensePhoto', 'licensePhotoUpload', 'licensePhotoPreview', 'license');
    
    // 送信ボタン
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', showConfirmModal);
    }
    
    // モーダルボタン
    const cancelBtn = document.getElementById('cancelBtn');
    const confirmBtn = document.getElementById('confirmBtn');
    if (cancelBtn && confirmBtn) {
        cancelBtn.addEventListener('click', closeModal);
        confirmBtn.addEventListener('click', submitForm);
    }
    
    // エラーメッセージのクリア
    document.querySelectorAll('input, select, textarea').forEach(element => {
        element.addEventListener('input', function() {
            clearError(this);
        });
        element.addEventListener('change', function() {
            clearError(this);
        });
    });
}

// 「その他」発生場所セクションに利用者名フィールドを追加
  function ensureOtherUserNameField() {
      try {
          const otherSection = document.getElementById('otherLocationSection');
          if (!otherSection) return;

          // 既に存在する場合は何もしない
          if (document.getElementById('userName')) return;

          const locationCategorySelect = document.getElementById('locationCategory');
          const locationGroup = locationCategorySelect && locationCategorySelect.closest('.form-group');

          const wrapper = document.createElement('div');
          wrapper.className = 'form-group';
          wrapper.innerHTML = [
              '<label class="required">利用者の名前</label>',
              '<input type="text" id="userName" name="userName" placeholder="利用者の氏名を入力してください">',
              '<span class="error-message">利用者の名前を入力してください</span>'
          ].join('');

          if (locationGroup && locationGroup.parentElement === otherSection) {
              otherSection.insertBefore(wrapper, locationGroup);
          } else {
              otherSection.insertBefore(wrapper, otherSection.firstChild);
          }
      } catch (e) {
          console.error('利用者名フィールド生成エラー:', e);
      }
  }

  // 送信ボタンクリック時のラッパー（「その他」の利用者名必須チェックを追加）
  function handleSubmitClick() {
      const accidentTypeInput = document.querySelector('input[name="accidentType"]:checked');
      if (accidentTypeInput && accidentTypeInput.value === 'other') {
          const userNameField = document.getElementById('userName');
          if (userNameField && !userNameField.value) {
              showError(userNameField);
              alert('利用者の名前を入力してください');
              return;
          }
      }

      showConfirmModal();
  }

// 事故種類変更時の処理
function handleAccidentTypeChange(e) {
    const vehicleSection = document.getElementById('vehicleSection');
    const otherLocationSection = document.getElementById('otherLocationSection');
    const vehiclePhotos = document.getElementById('vehiclePhotos');
    const locationCategory = document.getElementById('locationCategory');
    const detailLocation = document.getElementById('detailLocation');
    const otherLocation = document.getElementById('otherLocation');
    const otherAccidentCategory = document.getElementById('otherAccidentCategory');
    const detailLocationDiv = document.getElementById('detailLocationDiv');
    const otherLocationDiv = document.getElementById('otherLocationDiv');

    if (e.target.value === 'vehicle') {
        vehicleSection.classList.add('active');
        vehiclePhotos.classList.add('active');
        otherLocationSection.style.display = 'none';

        if (locationCategory) {
            locationCategory.value = '';
        }
        if (detailLocation) {
            detailLocation.value = '';
            if (detailLocationDiv) {
                detailLocationDiv.style.display = 'none';
            }
        }
        if (otherLocation) {
            otherLocation.value = '';
            if (otherLocationDiv) {
                otherLocationDiv.style.display = 'none';
            }
        }
        if (otherAccidentCategory) {
            otherAccidentCategory.value = '';
        }
    } else {
        vehicleSection.classList.remove('active');
        vehiclePhotos.classList.remove('active');
        otherLocationSection.style.display = 'block';
    }

    // 事故種類に応じて「事故現場の写真」の必須を切り替え
    setScenePhotoRequired(e.target.value === 'vehicle');
}

// 「事故現場の写真」を必須/任意に切り替え
function setScenePhotoRequired(isRequired) {
    const sceneInput = document.getElementById('scenePhoto');
    // ラベルは scenePhotoUpload の親(.form-group)内の <label>
    const sceneLabel = document.querySelector('#scenePhotoUpload')?.parentElement?.querySelector('label');
    if (!sceneInput) return;
    if (isRequired) {
        sceneInput.setAttribute('required', 'required');
        if (sceneLabel) sceneLabel.classList.add('required');
    } else {
        sceneInput.removeAttribute('required');
        if (sceneLabel) sceneLabel.classList.remove('required');
        // 任意にしたときはエラー表示を消す
        clearError(sceneInput);
    }
}

// 対物選択時の処理
function handlePropertyDamageChange(e) {
    const propertyDetails = document.getElementById('propertyDetails');
    const propertyPhotoDiv = document.getElementById('propertyPhotoDiv');
    
    if (e.target.value === 'yes') {
        propertyDetails.classList.add('active');
        propertyPhotoDiv.style.display = 'block';
    } else {
        propertyDetails.classList.remove('active');
        propertyPhotoDiv.style.display = 'none';
    }
}

// 対人選択時の処理
function handlePersonalInjuryChange(e) {
    const injuryDetails = document.getElementById('injuryDetails');
    const licensePhotoDiv = document.getElementById('licensePhotoDiv');
    
    if (e.target.value === 'yes') {
        injuryDetails.classList.add('active');
        licensePhotoDiv.style.display = 'block';
    } else {
        injuryDetails.classList.remove('active');
        licensePhotoDiv.style.display = 'none';
    }
}

// 場所分類変更時の処理
function handleLocationCategoryChange(e) {
    const detailLocationDiv = document.getElementById('detailLocationDiv');
    const otherLocationDiv = document.getElementById('otherLocationDiv');
    const detailLocation = document.getElementById('detailLocation');
    
    // 選択肢をクリア
    detailLocation.innerHTML = '<option value="">選択してください</option>';
    
    const locationOptions = {
        '訪看': ['ご利用者宅', 'その他'],
        '小児': ['活動スペース', 'トイレ', '屋外', 'その他'],
        '施設': ['居室', '共有スペース', 'トイレ', '浴室', '中庭', '玄関前', '駐車場', '階段', 'その他']
    };
    
    if (e.target.value && locationOptions[e.target.value]) {
        detailLocationDiv.style.display = 'block';
        otherLocationDiv.style.display = 'none';
        
        locationOptions[e.target.value].forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            detailLocation.appendChild(option);
        });
    } else {
        detailLocationDiv.style.display = 'none';
        otherLocationDiv.style.display = 'none';
    }
}

// 詳細場所変更時の処理
function handleDetailLocationChange(e) {
    const otherLocationDiv = document.getElementById('otherLocationDiv');
    if (e.target.value === 'その他') {
        otherLocationDiv.style.display = 'block';
    } else {
        otherLocationDiv.style.display = 'none';
    }
}

// GPS位置情報取得
async function getLocation() {
    const locationInput = document.getElementById('location');
    const loading = Utils.showLoading(locationInput.parentElement, 'GPS取得中...');
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                // 住所を取得
                try {
                    const address = await getAddressFromCoordinates(lat, lng);
                    if (address) {
                        locationInput.value = address;
                        // 座標情報も保持（データ属性として）
                        locationInput.setAttribute('data-lat', lat);
                        locationInput.setAttribute('data-lng', lng);
                    } else {
                        // 住所取得に失敗した場合は座標を表示
                        locationInput.value = `緯度: ${lat.toFixed(6)}, 経度: ${lng.toFixed(6)}`;
                    }
                } catch (error) {
                    console.error('住所取得エラー:', error);
                    locationInput.value = `緯度: ${lat.toFixed(6)}, 経度: ${lng.toFixed(6)}`;
                }
                
                Utils.hideLoading(loading);
                clearError(locationInput);
            },
            function(error) {
                Utils.hideLoading(loading);
                alert('位置情報の取得に失敗しました。手動で入力してください。');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        Utils.hideLoading(loading);
        alert('お使いのブラウザは位置情報をサポートしていません。');
    }
}

// 座標から住所を取得する関数
async function getAddressFromCoordinates(lat, lng) {
    console.log('[GPS] 住所取得開始:', {lat, lng});
    
    // Google Maps Geocoding API を優先使用（詳細な住所情報を取得）
    const googleApiKey = config.googleMapsApiKey;
    
    if (googleApiKey) {
        try {
            console.log('[GPS] Google Maps API使用');
            // result_typeパラメータで詳細な住所を要求し、zoomレベル相当の精度指定
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=ja&result_type=street_address|premise|subpremise&location_type=ROOFTOP|RANGE_INTERPOLATED`
            );
            const data = await response.json();
            
            if (data.status === 'OK' && data.results.length > 0) {
                // より詳細な住所を優先して選択
                let bestResult = data.results[0];
                
                // street_address タイプの結果があれば優先
                for (const result of data.results) {
                    if (result.types.includes('street_address') || result.types.includes('premise')) {
                        bestResult = result;
                        break;
                    }
                }
                
                // Google APIのformatted_addressから日本を除去して使用
                const formattedAddress = cleanJapaneseAddress(bestResult.formatted_address);
                console.log('📍 住所取得完了:', formattedAddress);
                
                // Google Maps APIレスポンスをログに送信
                try {
                    await logGoogleMapsResponse({
                        coordinates: { lat, lng },
                        googleResponse: data,
                        extractedAddress: {
                            fullAddress: formattedAddress,
                            originalFormatted: bestResult.formatted_address,
                            houseNumber: extractHouseNumberFromResult(bestResult)
                        },
                        source: 'accident-report'
                    });
                } catch (logError) {
                    // ログ送信エラーは表示しない
                }
                
                return formattedAddress;
            }
        } catch (error) {
            console.error('❌ Google Maps APIエラー:', error.message);
        }
    }
    
    // フォールバック: Nominatim (OpenStreetMap) を使用
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ja&zoom=19&addressdetails=1&extratags=1&namedetails=1`,
            {
                headers: {
                    'User-Agent': 'Cruto-Accident-Report/1.0'
                }
            }
        );
        const data = await response.json();
        
        if (data && data.display_name) {
            const detailedAddress = formatDetailedJapaneseAddress(data);
            console.log('📍 住所取得完了 (Nominatim):', detailedAddress);
            return detailedAddress;
        }
    } catch (error) {
        console.error('❌ Nominatim APIエラー:', error.message);
    }
    
    return null;
}

// Google Maps APIのaddress_componentsから詳細住所を構築
function buildDetailedAddressFromGoogle(result) {
    if (!result.address_components) return null;
    
    console.log('[GPS] Google address_components解析:', result.address_components);
    
    let formatted = '';
    let streetNumber = '';
    let route = '';
    let sublocality = '';
    let locality = '';
    let administrativeArea = '';
    let premise = '';
    let subpremise = '';
    let postalCode = '';
    
    // address_componentsから各要素を抽出（郵便番号は除外）
    result.address_components.forEach(component => {
        const types = component.types;
        console.log('[GPS] コンポーネント:', component.long_name, types);
        
        // 郵便番号は記録するが住所には含めない
        if (types.includes('postal_code')) {
            postalCode = component.long_name;
            console.log('[GPS] 郵便番号検出（除外）:', postalCode);
            return; // 郵便番号は住所構築に使用しない
        }
        
        if (types.includes('street_number')) {
            streetNumber = component.long_name; // 基本番地
            console.log('[GPS] 基本番地:', streetNumber);
        }
        if (types.includes('subpremise')) {
            subpremise = component.long_name; // 建物内番号
            console.log('[GPS] 建物内番号:', subpremise);
        }
        if (types.includes('route')) {
            route = component.long_name; // 通り名
        }
        if (types.includes('premise')) {
            premise = component.long_name; // 建物名
        }
        if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
            sublocality = component.long_name; // 丁目など
        }
        if (types.includes('locality')) {
            locality = component.long_name; // 市区町村
        }
        if (types.includes('administrative_area_level_1')) {
            administrativeArea = component.long_name; // 都道府県
        }
    });
    
    // 日本の住所形式で構築
    if (administrativeArea) formatted += administrativeArea;
    if (locality) formatted += locality;
    if (sublocality) formatted += sublocality;
    
    // 番地情報を構築（国府台4-6-6形式）
    let houseNumberPart = '';
    if (streetNumber) {
        houseNumberPart = streetNumber;
        console.log('[GPS] 基本番地設定:', streetNumber);
        
        // subpremiseがあれば追加（例：4-6-6の-6-6部分）
        if (subpremise) {
            // subpremiseが既にハイフンを含んでいるかチェック
            if (subpremise.includes('-')) {
                houseNumberPart += '-' + subpremise;
            } else {
                houseNumberPart += '-' + subpremise;
            }
            console.log('[GPS] 詳細番地追加:', houseNumberPart);
        }
        
        formatted += houseNumberPart;
    } else if (route && route.match(/\d+/)) {
        // routeに数字が含まれている場合は番地として使用
        const routeNumber = route.match(/\d+/)[0];
        formatted += routeNumber;
        console.log('[GPS] route番地追加:', routeNumber);
    }
    
    // 建物名があれば追加
    if (premise) {
        formatted += ' ' + premise;
    }
    
    console.log('[GPS] Google構築結果:', formatted);
    console.log('[GPS] 除外された郵便番号:', postalCode);
    return formatted || null;
}

// 日本の住所形式に詳細整形する関数（番地まで取得）
function formatDetailedJapaneseAddress(data) {
    if (!data.address) return data.display_name;
    
    const addr = data.address;
    let formatted = '';
    
    console.log('[GPS] 住所構造解析:', addr);
    
    // 都道府県
    if (addr.state || addr.province) {
        formatted += addr.state || addr.province;
    }
    
    // 市区町村
    if (addr.city || addr.town || addr.municipality) {
        formatted += addr.city || addr.town || addr.municipality;
    }
    
    // 区・特別区
    if (addr.city_district || addr.suburb) {
        formatted += addr.city_district || addr.suburb;
    }
    
    // 町・丁目（複数パターンに対応）
    if (addr.quarter || addr.neighbourhood || addr.residential) {
        formatted += addr.quarter || addr.neighbourhood || addr.residential;
    }
    
    // 番地・号（詳細な住所番号）
    let houseInfo = '';
    
    // house_number（番地）
    if (addr.house_number) {
        houseInfo += addr.house_number;
    }
    
    // postcode（郵便番号）から詳細情報を推定
    if (addr.postcode && !houseInfo) {
        // 郵便番号がある場合、より具体的な位置を示唆
        console.log('[GPS] 郵便番号から位置推定:', addr.postcode);
    }
    
    // 番地情報がない場合、追加の方法で番地を推定
    if (!houseInfo) {
        // 1. road（道路名）から推定
        if (addr.road) {
            console.log('[GPS] 道路名から位置推定:', addr.road);
            const roadMatch = addr.road.match(/(\d+)/);
            if (roadMatch) {
                houseInfo = roadMatch[1];
            }
        }
        
        // 2. display_nameから番地を抽出（郵便番号を除外）
        if (!houseInfo && data.display_name) {
            console.log('[GPS] display_nameから番地抽出:', data.display_name);
            // 郵便番号パターンを除外: 3桁-4桁は郵便番号なので除外
            // 番地パターン: 1-2桁の番地（例: 4-6-6, 15-23）
            const addressMatch = data.display_name.match(/(?:^|[^\d])(\d{1,2}(?:-\d{1,2}){1,2})(?:[^\d]|$)/);
            if (addressMatch && !addressMatch[1].match(/^\d{3}-\d{4}$/)) {
                houseInfo = addressMatch[1];
                console.log('[GPS] display_nameから番地発見:', houseInfo);
            }
        }
        
        // 3. より詳細な座標で再検索（最後の手段）
        if (!houseInfo) {
            console.log('[GPS] 番地情報なし');
        }
    }
    
    if (houseInfo) {
        formatted += houseInfo;
    }
    
    // 建物名・施設名
    if (addr.amenity || addr.building || addr.shop || addr.office) {
        const facilityName = addr.amenity || addr.building || addr.shop || addr.office;
        formatted += ' ' + facilityName;
    }
    
    // 具体的な場所の名前（name）
    if (data.name && data.name !== formatted) {
        formatted += ' (' + data.name + ')';
    }
    
    console.log('[GPS] 整形結果:', formatted);
    
    return formatted || data.display_name;
}

// 従来の関数も残す（互換性のため）
function formatJapaneseAddress(data) {
    return formatDetailedJapaneseAddress(data);
}

/**
 * 事故報告データを新しい構造に変換
 */
function buildReportData(formData, photoData) {
    // 事故種類を日本語に変換
    const accidentTypeJp = formData.accidentType === 'vehicle' ? '車両事故' : 'その他';
    
    const baseData = {
        // 基本情報
        reporterName: formData.reporter,
        office: formData.office,
        incidentDate: formData.incidentDate,
        incidentTime: formData.incidentTime,
        accidentType: accidentTypeJp,
        location: formData.location,
        details: formData.accidentDetails,
        
        // 写真データ
        photos: {
            scene: photoData.scene || []
        }
    };


        baseData.userName = formData.userName;
    
    // 条件分岐データを追加
    if (formData.accidentType === 'other') {
        // その他事故の項目
        baseData.otherAccidentCategory = formData.otherAccidentCategory;
        baseData.locationCategory = formData.locationCategory;
        baseData.locationDetail = formData.detailLocation;
        baseData.locationNote = formData.otherLocation;
        
    } else if (formData.accidentType === 'vehicle') {
        // 車両事故の項目
        baseData.driverName = formData.driverName;
        baseData.propertyDamage = formData.propertyDamage;
        baseData.propertyDetails = formData.propertyDetailsText;
        baseData.personalInjury = formData.personalInjury;
        baseData.personalDetails = formData.injuryDetailsText;
        
        // 負傷情報（チェックボックスの状態を取得）
        const injurySelf = document.getElementById('injurySelf')?.checked ? 'あり' : '';
        const injuryPassenger = document.getElementById('injuryPassenger')?.checked ? 'あり' : '';
        const injuryOther = document.getElementById('injuryOther')?.checked ? 'あり' : '';
        const injuryDetailsText = formData.injuryDetailsText || '';
        
        baseData.injury = {
            self: injurySelf,
            selfDetails: injurySelf ? injuryDetailsText : '',
            passenger: injuryPassenger,
            passengerDetails: injuryPassenger ? injuryDetailsText : '',
            other: injuryOther,
            otherDetails: injuryOther ? injuryDetailsText : ''
        };
        
        // 車両事故の追加写真（条件に関係なく全て追加）
        baseData.photos.property = photoData.property || [];
        baseData.photos.otherVehicle = photoData.otherVehicle || [];
        baseData.photos.ownVehicle = photoData.ownVehicle || [];
        baseData.photos.license = photoData.license || [];
    }
    
    // データ構築完了
    
    return baseData;
}

/**
 * Google Maps APIのformatted_addressから不要な部分を除去
 */
function cleanJapaneseAddress(formattedAddress) {
    if (!formattedAddress) return '';
    
    let cleanedAddress = formattedAddress;
    
    // 末尾の「日本」を除去
    cleanedAddress = cleanedAddress.replace(/、?\s*日本$/, '');
    
    // 先頭の「日本、」も除去
    cleanedAddress = cleanedAddress.replace(/^日本、\s*/, '');
    
    // 郵便番号パターンを除去（例：〒272-0827、272-0827）
    cleanedAddress = cleanedAddress.replace(/〒?\d{3}-?\d{4}\s*/, '');
    
    // 先頭の郵便番号パターンも除去
    cleanedAddress = cleanedAddress.replace(/^\d{3}-?\d{4}\s*/, '');
    
    // 余分なスペースとカンマを清潔化
    cleanedAddress = cleanedAddress.replace(/^\s*,?\s*/, ''); // 先頭のカンマとスペース
    cleanedAddress = cleanedAddress.replace(/\s*,?\s*$/, ''); // 末尾のカンマとスペース
    cleanedAddress = cleanedAddress.replace(/\s+/g, ''); // 複数スペースを削除
    
    console.log('[GPS] 住所清潔化:', formattedAddress, '->', cleanedAddress);
    return cleanedAddress;
}

/**
 * Google Maps APIレスポンスをGASにログとして送信
 */
async function logGoogleMapsResponse(data) {
    try {
        const response = await fetch(config.gasUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'logGoogleMapsResponse',
                ...data
            })
        });
        
        const result = await response.json();
        console.log('[GPS] ログ送信完了:', result);
        return result;
    } catch (error) {
        console.error('[GPS] ログ送信失敗:', error);
        throw error;
    }
}

/**
 * Google Maps APIの結果から番地（house number）を抽出
 */
function extractHouseNumberFromResult(result) {
    if (!result || !result.address_components) return '';
    
    let streetNumber = '';
    let subpremise = '';
    let postalCode = '';
    
    result.address_components.forEach(component => {
        const types = component.types;
        
        // 郵便番号は除外（ログ用に記録のみ）
        if (types.includes('postal_code')) {
            postalCode = component.long_name;
            return; // 番地構築には使用しない
        }
        
        if (types.includes('street_number')) {
            streetNumber = component.long_name;
        }
        if (types.includes('subpremise')) {
            subpremise = component.long_name;
        }
    });
    
    // 番地の構築（例：4-6-6）
    let houseNumber = '';
    if (streetNumber) {
        houseNumber = streetNumber;
        if (subpremise) {
            // 既にハイフンが含まれているかチェック
            if (!subpremise.startsWith('-')) {
                houseNumber += '-' + subpremise;
            } else {
                houseNumber += subpremise;
            }
        }
    }
    
    console.log('[GPS] 抽出した番地:', houseNumber, '除外郵便番号:', postalCode);
    return houseNumber;
}

// 画像圧縮設定
const imageConfig = {
    // 高画質設定（より大きいサイズと高品質）
    maxWidth: 1200,    // 600 → 1200
    maxHeight: 900,    // 450 → 900
    quality: 0.85,     // 0.5 → 0.85 (85%品質)
    enableCompression: true  // falseで圧縮無効化可能
};

// 画像圧縮（高画質対応版）
async function compressImageDirect(file) {
    // 圧縮が無効化されている場合は元画像をそのまま返す
    if (!imageConfig.enableCompression) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result.split(",")[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxWidth = imageConfig.maxWidth;
                const maxHeight = imageConfig.maxHeight;
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL("image/jpeg", imageConfig.quality);
                resolve(compressed.split(",")[1]);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 写真アップロード設定
function setupPhotoUpload(inputId, uploadDivId, previewId, photoType) {
    const input = document.getElementById(inputId);
    const uploadDiv = document.getElementById(uploadDivId);
    const preview = document.getElementById(previewId);
    
    uploadDiv.addEventListener('click', () => input.click());
    
    input.addEventListener('change', async function(e) {
        preview.innerHTML = '';
        photoData[photoType] = [];
        
        for (const file of Array.from(e.target.files)) {
            if (file.type.startsWith('image/')) {
                try {
                    console.log(`📷 画像処理開始: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                    
                    // 画像を直接圧縮（参考アプリ準拠）
                    const base64 = await compressImageDirect(file);
                    const compressedSize = base64.length * 0.75 / 1024; // Base64サイズからおおよそのKBを計算
                    
                    console.log(`📷 圧縮完了: ${file.name} → ${compressedSize.toFixed(1)}KB`);
                    
                    photoData[photoType].push({
                        name: file.name,
                        data: base64,
                        originalSize: file.size,
                        compressedSize: base64.length
                    });
                    
                    // プレビュー表示
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        preview.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                } catch (error) {
                    console.error('画像処理エラー:', error);
                }
            }
        }
        
        if (photoType === 'scene' && photoData[photoType].length > 0) {
            clearError(input);
        }
    });
}

// エラー表示クリア
function clearError(element) {
    const errorMsg = element.parentElement.querySelector('.error-message');
    if (errorMsg) {
        errorMsg.classList.remove('show');
    }
}

// エラー表示
function showError(element) {
    const errorMsg = element.parentElement.querySelector('.error-message');
    if (errorMsg) {
        errorMsg.classList.add('show');
    }
}

// バリデーション
function validateForm() {
    let isValid = true;
    
    // 必須項目のチェック
    const requiredFields = ['incidentDate', 'incidentTime', 'accidentDetails'];
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field.value) {
            showError(field);
            isValid = false;
        }
    });
    
   // 事業所のチェック
    const office = document.getElementById('office').value;
    if (!office) {
        alert('事業所が設定されていません');
        isValid = false;
    }
    
    // 事故種類の選択チェック
    if (!document.querySelector('input[name="accidentType"]:checked')) {
        const radioGroup = document.querySelector('.radio-group');
        showError(radioGroup);
        isValid = false;
    }
    
    // 事故現場の写真チェック（車両事故のときのみ必須）
    const selectedTypeForPhoto = document.querySelector('input[name="accidentType"]:checked')?.value;
    if (selectedTypeForPhoto === 'vehicle' && photoData.scene.length === 0) {
        showError(document.getElementById('scenePhoto'));
        isValid = false;
    }
    
    // 車両事故の場合の追加チェック
    const accidentType = document.querySelector('input[name="accidentType"]:checked');
    if (accidentType && accidentType.value === 'vehicle') {
        // 運転手名
        const driverName = document.getElementById('driverName');
        if (!driverName.value) {
            showError(driverName);
            isValid = false;
        }
        
        // 対物・対人の選択
        if (!document.querySelector('input[name="propertyDamage"]:checked')) {
            isValid = false;
        }
        if (!document.querySelector('input[name="personalInjury"]:checked')) {
            isValid = false;
        }
        
        // 対物ありの場合の詳細
        const propertyDamage = document.querySelector('input[name="propertyDamage"]:checked');
        if (propertyDamage && propertyDamage.value === 'yes') {
            const propertyDetails = document.getElementById('propertyDetailsText');
            if (!propertyDetails.value) {
                showError(propertyDetails);
                isValid = false;
            }
        }
        
        // 対人ありの場合の詳細
        const personalInjury = document.querySelector('input[name="personalInjury"]:checked');
        if (personalInjury && personalInjury.value === 'yes') {
            const injuryDetails = document.getElementById('injuryDetailsText');
            if (!injuryDetails.value) {
                showError(injuryDetails);
                isValid = false;
            }
        }
        
        // 発生場所
        const location = document.getElementById('location');
        if (!location.value) {
            showError(location);
            isValid = false;
        }
    } else {
        // その他の場合の場所チェック
        const otherAccidentCategory = document.getElementById('otherAccidentCategory');
        if (!otherAccidentCategory.value) {
            showError(otherAccidentCategory);
            isValid = false;
        }

        const locationCategory = document.getElementById('locationCategory');
        if (!locationCategory.value) {
            showError(locationCategory);
            isValid = false;
        }
        
        if (locationCategory.value) {
            const detailLocation = document.getElementById('detailLocation');
            if (!detailLocation.value) {
                showError(detailLocation);
                isValid = false;
            }
            
            if (detailLocation.value === 'その他') {
                const otherLocation = document.getElementById('otherLocation');
                if (!otherLocation.value) {
                    showError(otherLocation);
                    isValid = false;
                }
            }
        }
    }
    
    return isValid;
}

// 確認モーダル表示
function showConfirmModal() {
    if (!validateForm()) {
        alert('必須項目を入力してください');
        return;
    }
    
    // フォームデータ収集
    collectFormData();
    
    // 確認内容の生成
    const confirmContent = document.getElementById('confirmContent');
    confirmContent.innerHTML = generateConfirmContent();
    
    // モーダル表示
    document.getElementById('confirmModal').classList.add('show');
}

// フォームデータ収集
function collectFormData() {
    const form = document.getElementById('accidentReportForm');
    formData = Utils.formToObject(form);
    
    // 手動で値を設定
    formData.office = document.getElementById('office').value || userOrganization;
    formData.otherAccidentCategory = document.getElementById('otherAccidentCategory')?.value || '';

    // チェックボックスの値を収集
    const injuryTypes = [];
    document.querySelectorAll('input[name="injuryType"]:checked').forEach(cb => {
        injuryTypes.push(cb.value);
    });
    formData.injuryTypes = injuryTypes;

    // 写真データを追加
    formData.photos = photoData;
}

// 確認内容生成
function generateConfirmContent() {
    const accidentType = formData.accidentType === 'vehicle' ? '車両事故' : 'その他';
    const office = formData.office || userOrganization;
    
    let html = `
        <p><strong>報告者:</strong> ${formData.reporter}</p>
        <p><strong>事業所:</strong> ${office}</p>
        <p><strong>発生日:</strong> ${Utils.formatDate(formData.incidentDate)}</p>
        <p><strong>発生時刻:</strong> ${Utils.formatTime(formData.incidentTime)}</p>
        <p><strong>事故種類:</strong> ${accidentType}</p>
    `;
    
    if (formData.accidentType === 'vehicle') {
        html += `
            <p><strong>運転手:</strong> ${formData.driverName}</p>
            <p><strong>対物:</strong> ${formData.propertyDamage === 'yes' ? 'あり' : 'なし'}</p>
            <p><strong>対人:</strong> ${formData.personalInjury === 'yes' ? 'あり' : 'なし'}</p>
            <p><strong>発生場所:</strong> ${formData.location}</p>
        `;
    } else {
        const categorySelect = document.getElementById('locationCategory');
        const locationCategory = categorySelect.options[categorySelect.selectedIndex].text;
        const otherAccidentCategory = document.getElementById('otherAccidentCategory');
        const accidentCategoryText = otherAccidentCategory && otherAccidentCategory.value
            ? otherAccidentCategory.options[otherAccidentCategory.selectedIndex].text
            : '未選択';

        html += `<p><strong>事故種類:</strong> ${accidentCategoryText}</p>`;
        html += `<p><strong>事業所分類:</strong> ${locationCategory}</p>`;

        if (formData.detailLocation) {
            html += `<p><strong>詳細場所:</strong> ${formData.detailLocation}</p>`;
        }
        if (formData.otherLocation) {
            html += `<p><strong>その他の場所:</strong> ${formData.otherLocation}</p>`;
        }
    }
    
    html += `
        <p><strong>事故詳細:</strong><br>${formData.accidentDetails.replace(/\n/g, '<br>')}</p>
        <p><strong>写真:</strong> 事故現場 ${photoData.scene.length}枚`;
    
    if (formData.accidentType === 'vehicle') {
        if (photoData.otherVehicle.length > 0) {
            html += `, 相手の車 ${photoData.otherVehicle.length}枚`;
        }
        if (photoData.ownVehicle.length > 0) {
            html += `, 自分の車 ${photoData.ownVehicle.length}枚`;
        }
        if (photoData.license.length > 0) {
            html += `, 免許証 ${photoData.license.length}枚`;
        }
    }
    
    html += '</p>';
    
    return html;
}

// モーダルを閉じる
function closeModal() {
    document.getElementById('confirmModal').classList.remove('show');
}

// フォーム送信（高速化対応）
async function submitForm() {
    const submitBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const sendingMessage = document.getElementById('sendingMessage');
    
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    sendingMessage.style.display = 'block'; // 送信中メッセージを表示
    
    // プログレス表示用
    let progressStep = 0;
    const progressSteps = ['データ準備中...', '画像処理中...', '送信中...', '保存中...'];
    
    const updateProgress = () => {
        if (progressStep < progressSteps.length) {
            submitBtn.textContent = progressSteps[progressStep];
            progressStep++;
        }
    };
    
    updateProgress(); // データ準備中...
    
    try {
        // タイムスタンプ追加
        formData.timestamp = new Date().toISOString();
        
        updateProgress(); // 画像処理中...
        
        // 新しいデータ構造に変換
        const reportData = buildReportData(formData, photoData);
        
        // デバッグ: 送信データ確認
        console.log('🚚 送信データ確認:', {
            scene: photoData.scene?.length || 0,
            property: photoData.property?.length || 0,
            otherVehicle: photoData.otherVehicle?.length || 0,
            ownVehicle: photoData.ownVehicle?.length || 0,
            license: photoData.license?.length || 0
        });

        console.log('📝 事故報告送信開始:', {
            事故種別: reportData.accidentType,
            写真枚数: totalPhotos,
            データサイズ: `${jsonSizeKB}KB`
        });

        // データサイズチェック
        const jsonSize = JSON.stringify(reportData).length;
        const jsonSizeKB = (jsonSize / 1024).toFixed(1);
        const totalPhotos = Object.values(reportData.photos).flat().length;
        
        
        // データサイズ制限チェック（5枚の画像でも2MB以内に収まるよう調整）
        if (jsonSize > 2 * 1024 * 1024) { // 2MB以上
            throw new Error(`データサイズが大きすぎます (${jsonSizeKB}KB)。画像を減らすか、より小さい画像を使用してください。`);
        }
        
        updateProgress(); // 送信中...
        
        // URLSearchParams形式で送信（参考アプリ準拠）
        const formDataParams = new URLSearchParams();
        formDataParams.append('action', 'submitAccidentReport');
        formDataParams.append('reporterName', reportData.reporterName || '');
        formDataParams.append('office', reportData.office || '');
        formDataParams.append('incidentDate', reportData.incidentDate || '');
        formDataParams.append('incidentTime', reportData.incidentTime || '');
        formDataParams.append('accidentType', reportData.accidentType || '');
        formDataParams.append('location', reportData.location || '');
        formDataParams.append('details', reportData.details || '');
        
        // 車両事故の場合の追加フィールド
        if (reportData.accidentType === '車両事故') {
            formDataParams.append('driverName', reportData.driverName || '');
            formDataParams.append('propertyDamage', reportData.propertyDamage || '');
            formDataParams.append('propertyDetails', reportData.propertyDetails || '');
            formDataParams.append('personalInjury', reportData.personalInjury || '');
            formDataParams.append('personalDetails', reportData.personalDetails || '');
            if (reportData.injury) {
                formDataParams.append('injurySelf', reportData.injury.self || '');
                formDataParams.append('injurySelfDetails', reportData.injury.selfDetails || '');
                formDataParams.append('injuryPassenger', reportData.injury.passenger || '');
                formDataParams.append('injuryPassengerDetails', reportData.injury.passengerDetails || '');
                formDataParams.append('injuryOther', reportData.injury.other || '');
                formDataParams.append('injuryOtherDetails', reportData.injury.otherDetails || '');
            }
        } else if (reportData.accidentType === 'その他') {
            // その他事故の場合の追加フィールド
            formDataParams.append('userName', reportData.userName || '');
            formDataParams.append('otherAccidentCategory', reportData.otherAccidentCategory || '');
            formDataParams.append('locationCategory', reportData.locationCategory || '');
            formDataParams.append('locationDetail', reportData.locationDetail || '');
            formDataParams.append('locationNote', reportData.locationNote || '');
        }
        
        // 写真データを個別に追加
        const photos = reportData.photos || {};
        Object.keys(photos).forEach(photoType => {
            if (photos[photoType] && photos[photoType].length > 0) {
                photos[photoType].forEach((photo, index) => {
                    formDataParams.append(`photo_${photoType}_${index}`, photo.data);
                    formDataParams.append(`photoName_${photoType}_${index}`, photo.name);
                });
            }
        });
        
            写真枚数: totalPhotos,
            データサイズKB: jsonSizeKB,
            URLSearchParams文字数: formDataParams.toString().length
        });
        
        const response = await fetch(config.gasUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formDataParams
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseText = await response.text();
        const result = JSON.parse(responseText);
        
        if (result.success) {
            updateProgress(); // 保存中...
            
            console.log('✅ 事故報告送信完了:', { 
                報告ID: result.reportId, 
                写真数: result.photoCount 
            });
            
            // 少し待ってから画面遷移（ユーザーに保存完了を視覚的に伝える）
            setTimeout(() => {
                localStorage.setItem('reportResult', JSON.stringify({
                    success: true,
                    reportId: result.reportId,
                    timestamp: reportData.timestamp
                }));
                window.location.href = 'result.html';
            }, 500);
        } else {
            throw new Error(result.error || '送信に失敗しました');
        }
        
    } catch (error) {
        console.error('❌ 送信エラー:', error.message);
        alert('送信に失敗しました。もう一度お試しください。\nエラー: ' + error.message);
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.textContent = '送信する';
        sendingMessage.style.display = 'none'; // 送信中メッセージを非表示
    }
}
