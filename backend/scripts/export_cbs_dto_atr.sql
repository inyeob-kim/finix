-- FINIX cbs_dto_atr.json export (nested/list DTO leaf fields)
-- Save result as backend/cbs_dto_atr.json
--
-- cbs_srvc.json 만으로는 부족합니다.
-- 예: PY025 output_fields = outList + nested_dto_class_name=AutoSweepCcRsltInqrySvcOutSub
--     하지만 SubOut 클래스의 dt/amt 등은 In/Out DTO가 아니라서 cbs_srvc에 안 실립니다.
-- 이 쿼리는 rd_app_dto_class_atr_d 의 모든 CLASS_NM 필드를 가져와
-- FINIX가 outList.0.dt 같은 path chip 을 만들 수 있게 합니다.
--
-- MySQL 8+ / MariaDB. INST_CD 는 환경에 맞게 조정.

SELECT
    CLASS_NM AS class_name,
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'field_name', ATR_NM,
            'nested_dto_class_name', SUB_DTO_CLASS_NM,
            'list_flag', LIST_DTO_YN,
            'required_flag', MNDTRY_YN,
            'required_status',
                CASE
                    WHEN MNDTRY_YN = 'Y' THEN 'required'
                    ELSE 'optional'
                END,
            'validation_rule', ATR_VLDTN_RULE_CNTNT,
            'validation_method_code', ATR_VLDTN_WAY_CD,
            'dto_status_code', DTO_STS_CD
        )
    ) AS fields
FROM rd_app_dto_class_atr_d
WHERE INST_CD = '1001'
GROUP BY CLASS_NM, INST_CD
ORDER BY CLASS_NM;
